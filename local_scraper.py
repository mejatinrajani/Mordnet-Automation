import pandas as pd
import requests
import urllib.parse
import time
import random

INPUT_FILE = 'locations.xlsx'

def get_headers(lat, lon, encoded_product):
    """Constructs headers using exact GPS coordinates and specific device IDs."""
    return {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Device_id": "31c4f598c9190789", 
        "Lat": str(lat),
        "Lon": str(lon),
        "Origin": "https://blinkit.com",
        "Referer": f"https://blinkit.com/s/?q={encoded_product}",
        "Rn_bundle_version": "1009003012",
        "Sec-Ch-Ua-Platform": '"Android"',
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

def check_availability(lat, lon, product_name):
    """Sends a direct POST request to Blinkit's layout search API."""
    encoded_product = urllib.parse.quote(str(product_name))
    url = f"https://blinkit.com/v1/layout/search?q={encoded_product}&search_type=type_to_search"
    headers = get_headers(lat, lon, encoded_product)
    
    try:
        response = requests.post(url, headers=headers, json={}, timeout=10)
        
        if response.status_code == 403:
            return "Blocked by Firewall (403)"
        if response.status_code != 200:
            return f"HTTP Error {response.status_code}"
            
        response_text = response.text.lower()
        if str(product_name).lower() in response_text:
            return "Yes"
        else:
            return "No"
            
    except Exception as e:
        return f"Error: {e}"

def run_local_test():
    print("🚀 Starting Blinkit Local Scraper...\n")
    
    try:
        df = pd.read_excel(INPUT_FILE)
    except FileNotFoundError:
        print(f"❌ Error: '{INPUT_FILE}' not found in the current directory.")
        return
        
    print(f"Found {len(df)} records. Processing...\n")
    print("-" * 60)
    
    for index, row in df.iterrows():
        lat = row['Latitude']
        lon = row['Longitude']
        product = row['Product_Name']
        
        print(f"[{index + 1}/{len(df)}] Searching for '{product}' at Lat: {lat}, Lon: {lon}...")
        
        status = check_availability(lat, lon, product)
        
        print(f"        👉 Result: {status}")
        print("-" * 60)
        
        time.sleep(random.uniform(3.0, 6.0))

if __name__ == "__main__":
    run_local_test()