from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
from typing import Optional
from dotenv import load_dotenv 
from geopy.geocoders import Nominatim
from tenacity import retry, stop_after_attempt, wait_exponential
import pandas as pd
import io
import asyncio
import random
import os
import json
import requests
import urllib.parse
import logging

# Import your external scraper function
from scraper import check_availability

# ==========================================
# 1. SETUP & CONFIGURATION
# ==========================================
load_dotenv()

# Structured Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

MAPBOX_ACCESS_TOKEN = os.getenv("MAPBOX_ACCESS_TOKEN")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

geolocator = Nominatim(user_agent="blinkit_locator_enterprise")

# ==========================================
# 2. RETRY-ENABLED EXTERNAL CALLS
# ==========================================

# Wrap the imported scraper so it safely retries on proxy drops
@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10), reraise=True)
def run_scraper_with_retry(lat, lon, product):
    return check_availability(lat, lon, product)

# Added retry decorator. Removed the broad try/except so network failures trigger the retry!
@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10), reraise=True)
def get_geo_details(location_name):
    if not MAPBOX_ACCESS_TOKEN:
        logger.error("MAPBOX_ACCESS_TOKEN not found in .env file.")
        return None, None, "API Key Missing"

    encoded_location = urllib.parse.quote(str(location_name))
    mapbox_url = f"https://api.mapbox.com/geocoding/v5/mapbox.places/{encoded_location}.json?country=in&access_token={MAPBOX_ACCESS_TOKEN}"
    
    # 1. PRIMARY GEOCODER: Mapbox
    response = requests.get(mapbox_url, timeout=10)
    response.raise_for_status() # Forces a retry if the API returns 500/502
    mapbox_data = response.json()
    
    if "features" in mapbox_data and len(mapbox_data["features"]) > 0:
        best_match = mapbox_data["features"][0]
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
        
        # 2. FALLBACK GEOCODER: OpenStreetMap
        if pincode == "Not Found":
            try:
                osm_url = f"https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lon}&format=json"
                osm_headers = {"User-Agent": "blinkit_enterprise_monitor"}
                osm_response = requests.get(osm_url, headers=osm_headers, timeout=5)
                osm_response.raise_for_status()
                osm_data = osm_response.json()
                
                if "address" in osm_data and "postcode" in osm_data["address"]:
                    pincode = osm_data["address"]["postcode"]
            except Exception as osm_error:
                logger.warning(f"OSM Fallback failed for {location_name}: {osm_error}")

        return lat, lon, pincode
        
    return None, None, "Not Found"


# ==========================================
# 3. CORE PIPELINE
# ==========================================
@app.post("/api/scan")
async def process_scan(
    file: UploadFile = File(...),
    user_id: str = Form(...),
    title: str = Form(...),
    operator_name: str = Form(...),
    passkey: str = Form(...),
    master_total: int = Form(...),
    run_id: Optional[str] = Form(None)
):
    # Security Check
    auth_check = supabase.table("supervisors").select("*").eq("name", operator_name).eq("passkey", passkey).execute()
    if len(auth_check.data) == 0:
        logger.warning(f"Unauthorized access attempt by operator: {operator_name}")
        raise HTTPException(status_code=401, detail="Security Exception: Invalid passkey for this operator.")
    
    contents = await file.read()
    
    # Payload Size Limit (Max 5MB per chunk)
    if len(contents) > 5 * 1024 * 1024:
        logger.error(f"Payload from {operator_name} exceeded 5MB limit.")
        raise HTTPException(status_code=413, detail="Payload too large.")
    
    # Parse as CSV (or fallback to Excel)
    try:
        df = pd.read_csv(io.StringIO(contents.decode('utf-8')))
    except Exception:
        df = pd.read_excel(io.BytesIO(contents))
    
    # Validation
    required_cols = ['Location', 'Product_Name']
    if not all(col in df.columns for col in required_cols):
        return {"error": f"Missing required columns. Found: {list(df.columns)}"}

    # Data Sanitization & Deduplication
    df['Location'] = df['Location'].astype(str).str.strip().replace(r'\xa0', ' ', regex=True)
    df['Product_Name'] = df['Product_Name'].astype(str).str.strip().replace(r'\xa0', ' ', regex=True)
    df = df.drop_duplicates(subset=['Location', 'Product_Name'])

    total_records = len(df)

    # Session Linking Logic
    if not run_id or run_id == "null" or run_id == "":
        run_response = supabase.table("automation_runs").insert({
            "user_id": user_id,
            "filename": file.filename,
            "total_locations": master_total, 
            "title": title,
            "operator_name": operator_name
        }).execute()
        current_run_id = run_response.data[0]['id']
        logger.info(f"Initialized new Master Run: {current_run_id} ({master_total} locations)")
    else:
        current_run_id = run_id

    async def event_stream():
        yield json.dumps({"type": "init", "run_id": current_run_id, "total_locations": master_total}) + "\n"

        current_count = 0

        for index, row in df.iterrows():
            raw_location = row['Location']
            product = row['Product_Name']
            
            # Defensive execution block
            try:
                lat, lon, pincode = get_geo_details(raw_location)
                
                if lat is None:
                    status = "Invalid Address"
                else:
                    status = run_scraper_with_retry(lat, lon, product)
            except Exception as e:
                # If it fails 3 times, Tenacity drops it here instead of crashing the server
                status = "Proxy/Network Timeout"
                logger.error(f"[{current_run_id}] Pipeline exception on {raw_location}: {str(e)}")
                lat, lon, pincode = None, None, None

            # DB Entry - USING current_run_id
            result_entry = {
                "run_id": current_run_id,
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

            # Stream payload
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


@app.get("/api/health", tags=["Health"])
def health_check():
    """
    Basic liveness probe to verify the service is awake and running.
    """
    return JSONResponse(content={"status": "awake", "message": "Backend is running and ready."})