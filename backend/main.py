from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
import pandas as pd
import io
import time
import uuid
import os
from dotenv import load_dotenv  

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

app = FastAPI()

# Allow React to communicate with FastAPI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"], # Add your React app's URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dummy Scraper Function (Replace this with your actual Blinkit proxy logic)
def scrape_location(lat, lon, product):
    # Simulate network delay and logic
    time.sleep(0.5) 
    return "Yes" # "Yes", "No", or "Unserviceable"

@app.post("/api/scan")
async def process_scan(
    file: UploadFile = File(...),
    user_id: str = Form(...)
):
    # 1. Read the Excel file in memory
    contents = await file.read()
    df = pd.read_excel(io.BytesIO(contents))
    
    # 2. Validate columns
    required_cols = ['Latitude', 'Longitude', 'Product_Name']
    if not all(col in df.columns for col in required_cols):
        return {"error": "Missing required columns"}

    total_records = len(df)

    # 3. Create a Run Session in Supabase
    run_response = supabase.table("automation_runs").insert({
        "user_id": user_id,
        "filename": file.filename,
        "total_locations": total_records
    }).execute()
    
    run_id = run_response.data[0]['id']

    # 4. Iterate and Scrape
    final_results = []
    
    for index, row in df.iterrows():
        lat = row['Latitude']
        lon = row['Longitude']
        product = row['Product_Name']
        
        # Call your scraper logic
        status = scrape_location(lat, lon, product)
        
        result_entry = {
            "run_id": run_id,
            "product_name": product,
            "latitude": lat,
            "longitude": lon,
            "status": status
        }
        final_results.append(result_entry)
        
        # 5. Save to Supabase (can also do this in bulk at the end)
        supabase.table("automation_results").insert(result_entry).execute()

    # 6. Format the response for React UI
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