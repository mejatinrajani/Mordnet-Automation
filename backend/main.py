from fastapi import FastAPI, File, UploadFile, Form
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
import pandas as pd
import io
import asyncio
import random
import os
import json
from dotenv import load_dotenv 
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut
import requests
import urllib.parse
from scraper import check_availability
from fastapi import Form, HTTPException

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

MAPBOX_ACCESS_TOKEN = os.getenv("MAPBOX_ACCESS_TOKEN")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "https://mordnet-automation.vercel.app"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

geolocator = Nominatim(user_agent="blinkit_locator_enterprise")

def get_geo_details(location_name):
    if not MAPBOX_ACCESS_TOKEN:
        print("Error: MAPBOX_ACCESS_TOKEN not found in .env file.")
        return None, None, "API Key Missing"

    encoded_location = urllib.parse.quote(str(location_name))
    mapbox_url = f"https://api.mapbox.com/geocoding/v5/mapbox.places/{encoded_location}.json?country=in&access_token={MAPBOX_ACCESS_TOKEN}"
    
    try:
        # 1. PRIMARY GEOCODER: Mapbox (For high-accuracy Lat/Lon)
        response = requests.get(mapbox_url, timeout=10).json()
        
        if "features" in response and len(response["features"]) > 0:
            best_match = response["features"][0]
            lon, lat = best_match["center"]
            
            pincode = "Not Found"
            
            # Mapbox Pincode Extraction Logic
            if "postcode" in best_match.get("place_type", []):
                pincode = best_match["text"]
            else:
                for context in best_match.get("context", []):
                    if context["id"].startswith("postcode"):
                        pincode = context["text"]
                        break
            
            # 2. FALLBACK GEOCODER: OpenStreetMap (If Mapbox misses the Pincode)
            if pincode == "Not Found":
                try:
                    # We reverse-geocode the exact Mapbox coordinates to force OSM to yield the postal code
                    osm_url = f"https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lon}&format=json"
                    osm_headers = {"User-Agent": "blinkit_enterprise_monitor"}
                    
                    osm_response = requests.get(osm_url, headers=osm_headers, timeout=5).json()
                    
                    if "address" in osm_response and "postcode" in osm_response["address"]:
                        pincode = osm_response["address"]["postcode"]
                except Exception as osm_error:
                    print(f"OSM Fallback failed for {location_name}: {osm_error}")

            return lat, lon, pincode
            
        return None, None, "Not Found"
        
    except Exception as e:
        print(f"Geocoding error for {location_name}: {e}")
        return None, None, "Error"

# Chunked Transfer Encoding (Streaming)
@app.post("/api/scan")
async def process_scan(
    file: UploadFile = File(...),
    user_id: str = Form(...),
    title: str = Form(...),
    operator_name: str = Form(...),
    passkey: str = Form(...)
):

    # 1. SECURITY CHECK: Verify the operator and passkey in Supabase
    auth_check = supabase.table("supervisors").select("*").eq("name", operator_name).eq("passkey", passkey).execute()
    
    if len(auth_check.data) == 0:
        raise HTTPException(status_code=401, detail="Security Exception: Invalid passkey for this operator.")
    
    contents = await file.read()
    df = pd.read_excel(io.BytesIO(contents))
    
    # 1. NEW VALIDATION: Check for 'Location' instead of Lat/Lon
    required_cols = ['Location', 'Product_Name']
    if not all(col in df.columns for col in required_cols):
        return {"error": f"Missing required columns. Found: {list(df.columns)}"}

    total_records = len(df)

    run_response = supabase.table("automation_runs").insert({
        "user_id": user_id,
        "filename": file.filename,
        "total_locations": total_records,
        "title": title,
        "operator_name": operator_name
    }).execute()
    
    run_id = run_response.data[0]['id']

    async def event_stream():
        yield json.dumps({"type": "init", "run_id": run_id, "total_locations": total_records}) + "\n"

        current_count = 0

        for index, row in df.iterrows():
            raw_location = str(row['Location'])
            product = str(row['Product_Name'])
            
            # 2. NEW LOGIC: Convert text to coordinates
            lat, lon, pincode = get_geo_details(raw_location)
            
            # If geocoding completely fails
            if lat is None:
                status = "Invalid Address"
            else:
                # Run your blinkit scraper
                status = check_availability(lat, lon, product)
            
            # 3. NEW DB ENTRY: Save the new fields
            result_entry = {
                "run_id": run_id,
                "product_name": product,
                "location_text": raw_location,
                "pincode": pincode,
                "latitude": lat,
                "longitude": lon,
                "status": status
            }
            
            supabase.table("automation_results").insert(result_entry).execute()

            current_count += 1
            progress_pct = round((current_count / total_records) * 100)

            # 4. STREAM NEW PAYLOAD
            yield json.dumps({
                "type": "result",
                "progress": progress_pct,
                "data": {
                    "Product_Name": product,
                    "Location": raw_location,
                    "Pincode": pincode,
                    "Latitude": lat,
                    "Longitude": lon,
                    "status": status
                }
            }) + "\n"

            # Rate limit protection (Nominatim requires 1 sec delay, Blinkit requires 3-6 sec)
            await asyncio.sleep(random.uniform(3.5, 6.0))

        yield json.dumps({"type": "complete"}) + "\n"

    return StreamingResponse(event_stream(), media_type="application/x-ndjson")