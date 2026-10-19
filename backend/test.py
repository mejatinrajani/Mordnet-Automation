import pandas as pd

# Sheet 1: Primary test data using standard NCR coordinates and your product
data_1 = {
    "Latitude": [28.6304, 28.6200, 28.4950, 27.4924, 19.0596],
    "Longitude": [77.2177, 77.3800, 77.0895, 77.6737, 72.8295],
    "Product_Name": [
        "peanut butter", 
        "Amul Taaza Toned Milk", 
        "peanut butter", 
        "Maggi 2-Minute Instant Noodles", 
        "Coca-Cola"
    ]
}

# Sheet 2: Secondary test data for varied products and regional edge cases
data_2 = {
    "Latitude": [12.9716, 22.5726, 28.5355, 19.2183, 27.4924],
    "Longitude": [77.5946, 88.3639, 77.3910, 72.9781, 77.6737],
    "Product_Name": [
        "Tata Salt", 
        "Oreo Biscuits", 
        "Mother Dairy Paneer", 
        "Red Bull Energy Drink", 
        "Haldiram Bhujia"
    ]
}

# Generate the Excel files
pd.DataFrame(data_1).to_excel("locations.xlsx", index=False)
pd.DataFrame(data_2).to_excel("locations_batch_2.xlsx", index=False)

print("✅ Successfully created 'locations.xlsx' and 'locations_batch_2.xlsx'")