"""
Simple script to test if the Flask backend is running and accessible.
Run this to verify your backend is working correctly.
"""
import requests
import json

import os
# Get API URL from environment or use default
API_URL = os.environ.get("API_URL", "http://localhost:5001")

def test_health_check():
    """Test the health check endpoint"""
    try:
        response = requests.get(f"{API_URL}/")
        if response.status_code == 200:
            print("✅ Health check passed!")
            print(f"   Response: {json.dumps(response.json(), indent=2)}")
            return True
        else:
            print(f"❌ Health check failed with status {response.status_code}")
            return False
    except requests.exceptions.ConnectionError:
        print("❌ Cannot connect to backend!")
        print(f"   Make sure Flask server is running at {API_URL}")
        print("   Start it with: python app.py")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_predict():
    """Test the predict endpoint"""
    try:
        data = {
            "category": "electronics",
            "current_stock": 100
        }
        response = requests.post(
            f"{API_URL}/predict",
            json=data,
            headers={"Content-Type": "application/json"}
        )
        if response.status_code == 200:
            print("✅ Prediction endpoint works!")
            print(f"   Response: {json.dumps(response.json(), indent=2)}")
            return True
        else:
            print(f"❌ Prediction failed with status {response.status_code}")
            print(f"   Response: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Error testing prediction: {e}")
        return False

if __name__ == "__main__":
    print("Testing Flask Backend Connection...")
    print("=" * 50)
    
    health_ok = test_health_check()
    print()
    
    if health_ok:
        test_predict()
    else:
        print("Skipping prediction test (health check failed)")
    
    print("=" * 50)

