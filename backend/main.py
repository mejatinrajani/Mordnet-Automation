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

from scraper import check_availability

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Chunked Transfer Encoding (Streaming)
@app.post("/api/scan")
async def process_scan(
    file: UploadFile = File(...),
    user_id: str = Form(...)
):
    contents = await file.read()
    df = pd.read_excel(io.BytesIO(contents))
    
    required_cols = ['Latitude', 'Longitude', 'Product_Name']
    if not all(col in df.columns for col in required_cols):
        return {"error": "Missing required columns"}

    total_records = len(df)

    run_response = supabase.table("automation_runs").insert({
        "user_id": user_id,
        "filename": file.filename,
        "total_locations": total_records,
        "title": f"Run - {file.filename}"
    }).execute()
    
    run_id = run_response.data[0]['id']

    # Define an asynchronous generator to yield results line by line
    async def event_stream():
        # Send initial metadata to the frontend
        yield json.dumps({
            "type": "init", 
            "run_id": run_id, 
            "total_locations": total_records
        }) + "\n"

        current_count = 0

        for index, row in df.iterrows():
            lat = row['Latitude']
            lon = row['Longitude']
            product = row['Product_Name']
            
            # Scrape the data
            status = check_availability(lat, lon, product)
            
            result_entry = {
                "run_id": run_id,
                "product_name": product,
                "latitude": lat,
                "longitude": lon,
                "status": status
            }
            
            # Save to Supabase silently
            supabase.table("automation_results").insert(result_entry).execute()

            current_count += 1
            progress_pct = round((current_count / total_records) * 100)

            # Stream the individual result to the React UI instantly
            yield json.dumps({
                "type": "result",
                "progress": progress_pct,
                "data": {
                    "Product_Name": product,
                    "Latitude": lat,
                    "Longitude": lon,
                    "status": status
                }
            }) + "\n"

            # IP Protection delay between requests
            await asyncio.sleep(random.uniform(3.0, 6.0))

        # Signal completion
        yield json.dumps({"type": "complete"}) + "\n"

    # Return the streaming response instead of waiting for the loop to finish
    return StreamingResponse(event_stream(), media_type="application/x-ndjson")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)