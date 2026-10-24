import requests
import urllib.parse
import json
import os
import time
from dotenv import load_dotenv 

load_dotenv()

BLINKIT_PROXY_URL = os.getenv("BLINKIT_PROXY_URL")

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

def check_availability(lat, lon, product_name, max_retries=3):
    encoded_product = urllib.parse.quote(str(product_name))
    url = f"https://blinkit.com/v1/layout/search?q={encoded_product}&search_type=type_to_search"
    headers = get_headers(lat, lon, encoded_product)

    proxies = {
        "http": BLINKIT_PROXY_URL,
        "https": BLINKIT_PROXY_URL
    } if BLINKIT_PROXY_URL else None

    last_exception = None

    for attempt in range(1, max_retries + 1):
        try:
            # 15s timeout is optimal for residential rotating gateways
            response = requests.post(url, headers=headers, json={}, proxies=proxies, timeout=15)
            
            # If the proxy rotated into a flagged node or rate-limited IP, retry with a fresh IP
            if response.status_code in (403, 429) and attempt < max_retries:
                time.sleep(1)
                continue
                
            if response.status_code == 403:
                return "Blocked by Firewall"
            if response.status_code == 400:
                return "Unserviceable"
            if response.status_code != 200:
                return f"HTTP Error {response.status_code}"
                
            data = response.json()
            
            if not data.get("is_success", False):
                return "Not Found"
                
            snippets = data.get("response", {}).get("snippets", [])
            if not snippets:
                return "Not Found"
                
            found_product = False
            
            # Break target name into individual lowercase words for flexible matching
            target_words = str(product_name).lower().split()
            target_length = len(target_words)
            
            # Traverse snippets and carousels
            for snippet in snippets:
                snippet_data = snippet.get("data", {})
                
                # 1. Check standard product cards
                product_text = snippet_data.get("name", {}).get("text", "")
                if not product_text:
                    product_text = snippet_data.get("display_name", {}).get("text", "")
                    
                if product_text and target_length > 0:
                    product_text_lower = product_text.lower()
                    matches = sum(1 for word in target_words if word in product_text_lower)
                    match_ratio = matches / target_length
                    
                    # DEBUG: Prints to your FastAPI terminal to show what Blinkit actually returned
                    print(f"[DEBUG] Searched: '{product_name}' | Found: '{product_text}' | Ratio: {match_ratio:.2f}")

                    if match_ratio >= 0.75:
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
                        
                        if item_text and target_length > 0:
                            item_text_lower = item_text.lower()
                            matches = sum(1 for word in target_words if word in item_text_lower)
                            match_ratio = matches / target_length
                            
                            print(f"[DEBUG - Carousel] Searched: '{product_name}' | Found: '{item_text}' | Ratio: {match_ratio:.2f}")

                            if match_ratio >= 0.75:
                                found_product = True
                                inventory = item_data.get("inventory", 0)
                                is_sold_out = item_data.get("is_sold_out", False)
                                
                                if inventory > 0 and not is_sold_out:
                                    return "Yes"
                                
            if found_product:
                return "Currently Out of Stock"
                
            return "Not Found"
                
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as e:
            last_exception = e
            # On network stall or timeout, rotating proxies provide a fresh IP on the next iteration
            if attempt < max_retries:
                time.sleep(2)
                continue
        except json.JSONDecodeError:
            return "Not Found"
        except Exception as e:
            return f"Error: {e}"

    return f"Error: Connection timed out after {max_retries} attempts ({last_exception})"