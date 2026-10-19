import requests
import urllib.parse
import json

def get_headers(lat, lon, encoded_product):
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
    encoded_product = urllib.parse.quote(str(product_name))
    url = f"https://blinkit.com/v1/layout/search?q={encoded_product}&search_type=type_to_search"
    headers = get_headers(lat, lon, encoded_product)
    
    try:
        response = requests.post(url, headers=headers, json={}, timeout=10)
        
        if response.status_code == 403:
            return "Blocked by Firewall"
        if response.status_code == 400:
            return "Unserviceable" # Cleaned up from "Unserviceable (400)"
        if response.status_code != 200:
            return f"HTTP Error {response.status_code}"
            
        data = response.json()
        
        if not data.get("is_success", False):
            return "Not Found"
            
        snippets = data.get("response", {}).get("snippets", [])
        if not snippets:
            return "Not Found"
            
        target_product_lower = str(product_name).lower()
        found_product = False
        
        # Traverse snippets and carousels
        for snippet in snippets:
            snippet_data = snippet.get("data", {})
            
            # 1. Check standard product cards
            product_text = snippet_data.get("name", {}).get("text", "")
            if not product_text:
                product_text = snippet_data.get("display_name", {}).get("text", "")
                
            if product_text and target_product_lower in product_text.lower():
                found_product = True
                inventory = snippet_data.get("inventory", 0)
                is_sold_out = snippet_data.get("is_sold_out", False)
                
                if inventory > 0 and not is_sold_out:
                    return "Yes"
                    
            # 2. Check nested carousels
            if "itemList" in snippet_data:
                for item in snippet_data["itemList"]:
                    item_data = item.get("data", {})
                    item_text = item_data.get("name", {}).get("text", "")
                    if not item_text:
                        item_text = item_data.get("display_name", {}).get("text", "")
                    
                    if item_text and target_product_lower in item_text.lower():
                        found_product = True
                        inventory = item_data.get("inventory", 0)
                        is_sold_out = item_data.get("is_sold_out", False)
                        
                        if inventory > 0 and not is_sold_out:
                            return "Yes"
                            
        # If we exited the loops and found the product text, but no inventory > 0
        if found_product:
            return "Currently Out of Stock"
            
        return "Not Found"
            
    except json.JSONDecodeError:
        return "Not Found"
    except Exception as e:
        return f"Error: {e}"