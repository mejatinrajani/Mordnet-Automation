import pandas as pd

# Creating a highly targeted test dataset with 20 locations and 10 niche/regional products
test_data = {
    "Latitude": [
        28.6304, 28.4950, 28.5703, 28.4744, 27.4924,  # Delhi CP, Gurgaon, Noida, Gr Noida, Mathura
        27.5750, 22.7196, 20.2961, 22.2604, 30.7352,  # Vrindavan, Indore, Bhubaneswar, Rourkela, Kedarnath
        19.0596, 19.1136, 12.9352, 12.9784, 18.5362,  # Mumbai x2, Bangalore x2, Pune
        17.4156, 13.0418, 22.5555, 30.7390, 23.0350   # Hyderabad, Chennai, Kolkata, Chandigarh, Ahmedabad
    ],
    "Longitude": [
        77.2177, 77.0895, 77.3218, 77.5040, 77.6737,  
        77.6611, 75.8577, 85.8245, 84.8536, 79.0669,  
        72.8295, 72.8697, 77.6245, 77.6408, 73.8939,  
        78.4347, 80.2341, 88.3522, 76.7827, 72.5293   
    ],
    "Product_Name": [
        "Blue Tokai Coffee",            # Delhi CP (Expect: Yes)
        "The Baker's Dozen Sourdough",  # Gurgaon (Expect: Yes)
        "NOTO Low Calorie Ice Cream",   # Noida (Expect: Yes/No depending on stock)
        "Perrier Sparkling Water",      # Greater Noida (Expect: Likely No)
        "Epigamia Greek Yogurt",        # Mathura (Expect: No)
        "Phool Incense Sticks",         # Vrindavan (Expect: No/Unserviceable)
        "Sleepy Owl Cold Coffee",       # Indore (Expect: Test availability)
        "Blue Tokai Coffee",            # Bhubaneswar (Expect: Test availability)
        "The Baker's Dozen Sourdough",  # Rourkela (Expect: No/Unserviceable)
        "Perrier Sparkling Water",      # Kedarnath (Expect: Unserviceable)
        "Chitale Bandhu Bakarwadi",     # Mumbai Bandra (Expect: Yes)
        "Epigamia Greek Yogurt",        # Mumbai Andheri (Expect: Yes)
        "Nandini Milk",                 # Bangalore Koramangala (Expect: Yes)
        "Chitale Bandhu Bakarwadi",     # Bangalore Indiranagar (Expect: Likely No)
        "Chitale Bandhu Bakarwadi",     # Pune (Expect: Yes)
        "Bikano Aloo Bhujia",           # Hyderabad (Expect: Likely No)
        "Nandini Milk",                 # Chennai (Expect: No)
        "Phool Incense Sticks",         # Kolkata (Expect: Test availability)
        "Sleepy Owl Cold Coffee",       # Chandigarh (Expect: Yes/No)
        "NOTO Low Calorie Ice Cream"    # Ahmedabad (Expect: Test availability)
    ]
}

# Generate the Excel file
df = pd.DataFrame(test_data)
df.to_excel("locations.xlsx", index=False)

print("✅ Successfully created 'locations.xlsx' with 20 diverse testing locations!")