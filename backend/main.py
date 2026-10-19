from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
import pandas as pd
import io
import asyncio
import random
import os
from dotenv import load_dotenv 

# Import your real scraping logic
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
        "total_locations": total_records
    }).execute()
    
    run_id = run_response.data[0]['id']

    final_results = []
    
    for index, row in df.iterrows():
        lat = row['Latitude']
        lon = row['Longitude']
        product = row['Product_Name']
        
        # Call the real scraper from scraper.py
        status = check_availability(lat, lon, product)
        
        result_entry = {
            "run_id": run_id,
            "product_name": product,
            "latitude": lat,
            "longitude": lon,
            "status": status
        }
        final_results.append(result_entry)
        
        # Save dynamically to DB
        supabase.table("automation_results").insert(result_entry).execute()

        # Non-blocking random delay (3 to 6 seconds) to protect your IP
        await asyncio.sleep(random.uniform(3.0, 6.0))

    ui_results = []
    for item in final_results:
        ui_results.append({
            "Product_Name": item["product_name"],
            "Latitude": item["latitude"],
            "Longitude": item["longitude"],
            "status": item["status"]
        })

    return {"message": "Success", "run_id": run_id, "results": ui_results}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)