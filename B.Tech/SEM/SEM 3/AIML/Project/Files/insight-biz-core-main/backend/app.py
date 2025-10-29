from flask import Flask, request, jsonify
import joblib
import pandas as pd
import datetime
from flask_cors import CORS
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# ==========================================================
# INITIALIZATION
# ==========================================================
app = Flask(__name__)
# Configure CORS to allow requests from the frontend
CORS(app, resources={
    r"/*": {
        "origins": ["http://localhost:8080", "http://127.0.0.1:8080", "http://localhost:5173", "http://localhost:3000"],
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type"]
    }
})

# Get the directory where this script is located
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "model", "inventory_forecast_pipeline.pkl")

if not os.path.exists(MODEL_PATH):
    raise FileNotFoundError(f"❌ Model not found at {MODEL_PATH}")

print(f"✅ Loading model from: {MODEL_PATH}")
model = joblib.load(MODEL_PATH)
print("✅ Model loaded successfully!")

# get features from pipeline
feature_names = list(model.feature_names_in_)
print("📊 Model trained on features:", feature_names)

# ==========================================================
# HEALTH CHECK ROUTE
# ==========================================================
@app.route("/", methods=["GET"])
@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "healthy",
        "service": "Inventory Forecast API",
        "model_loaded": True
    }), 200

# ==========================================================
# PREDICT ROUTE
# ==========================================================
@app.route("/predict", methods=["POST"])
def predict():
    try:
        data = request.get_json()

        if "category" not in data or "current_stock" not in data:
            return jsonify({"error": "Both 'category' and 'current_stock' are required"}), 400

        category = data["category"].lower().strip()
        current_stock = float(data["current_stock"])

        # === Step 1: Build empty input ===
        row = {col: 0 for col in feature_names}

        # === Step 2: Fill time-based values ===
        now = datetime.datetime.now()
        row["month"] = now.month
        row["weekofyear"] = now.isocalendar().week

        # === Step 3: Fill lags and rolling mean placeholders ===
        row["lag_1"] = current_stock * 0.9
        row["lag_2"] = current_stock * 0.85
        row["lag_3"] = current_stock * 0.8
        row["rolling_mean_3"] = (row["lag_1"] + row["lag_2"] + row["lag_3"]) / 3

        # === Step 4: Set category flag ===
        cat_col = f"cat_{category}"
        if cat_col in row:
            row[cat_col] = 1
        else:
            print(f"⚠️ Unknown category '{category}', defaulting all to 0")

        # === Step 5: Predict ===
        df = pd.DataFrame([row])
        predicted_sales = float(model.predict(df)[0])
        recommendation = "Overstock" if predicted_sales > current_stock else "Understock"

        return jsonify({
            "predicted_sales": round(predicted_sales, 2),
            "current_stock": current_stock,
            "recommendation": recommendation
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ==========================================================
# BULK PREDICT ROUTE
# ==========================================================
@app.route("/bulk_predict", methods=["POST"])
def bulk_predict():
    try:
        data = request.get_json()
        
        if not isinstance(data, list):
            return jsonify({"error": "Expected a list of prediction requests"}), 400
        
        results = []
        for item in data:
            if "category" not in item or "current_stock" not in item:
                results.append({
                    "error": "Both 'category' and 'current_stock' are required",
                    "category": item.get("category", "unknown"),
                    "current_stock": item.get("current_stock", 0)
                })
                continue
            
            category = item["category"].lower().strip()
            current_stock = float(item["current_stock"])
            
            # Build input row
            row = {col: 0 for col in feature_names}
            
            # Fill time-based values
            now = datetime.datetime.now()
            row["month"] = now.month
            row["weekofyear"] = now.isocalendar().week
            
            # Fill lags and rolling mean
            row["lag_1"] = current_stock * 0.9
            row["lag_2"] = current_stock * 0.85
            row["lag_3"] = current_stock * 0.8
            row["rolling_mean_3"] = (row["lag_1"] + row["lag_2"] + row["lag_3"]) / 3
            
            # Set category flag
            cat_col = f"cat_{category}"
            if cat_col in row:
                row[cat_col] = 1
            
            # Predict
            df = pd.DataFrame([row])
            predicted_sales = float(model.predict(df)[0])
            
            # Calculate decision logic
            safety_stock = predicted_sales * 1.2  # 20% buffer
            reorder_qty = max(0, int(safety_stock - current_stock))
            
            if predicted_sales > current_stock * 1.5:
                decision = "restock"
            elif predicted_sales < current_stock * 0.5:
                decision = "overstock"
            else:
                decision = "ok"
            
            results.append({
                "category": category,
                "pred_next_week_units": round(predicted_sales, 2),
                "current_stock": current_stock,
                "decision": decision,
                "reorder_qty": reorder_qty,
                "safety_stock_estimate": round(safety_stock, 2)
            })
        
        return jsonify(results), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ==========================================================
# SEND EMAIL ROUTE
# ==========================================================
@app.route("/send-email", methods=["POST"])
def send_email():
    try:
        data = request.get_json()
        
        if not data or "to" not in data or "subject" not in data:
            return jsonify({"error": "Missing required fields: 'to' and 'subject'"}), 400
        
        to_email = data["to"]
        subject = data["subject"]
        html_content = data.get("html", "")
        text_content = data.get("text", "")
        
        # Get email configuration from environment variables
        smtp_server = os.environ.get("SMTP_SERVER", "smtp.gmail.com")
        smtp_port = int(os.environ.get("SMTP_PORT", "587"))
        smtp_user = os.environ.get("SMTP_USER", "")
        smtp_password = os.environ.get("SMTP_PASSWORD", "")
        from_email = os.environ.get("FROM_EMAIL", smtp_user)
        
        # If no SMTP configured, return success (mock send for development)
        if not smtp_user or not smtp_password:
            print(f"⚠️ SMTP not configured. Would send email to {to_email} with subject: {subject}")
            print(f"📧 Set SMTP_USER, SMTP_PASSWORD, and FROM_EMAIL environment variables to enable email sending")
            return jsonify({
                "status": "sent",
                "message": "Email service not configured. Running in mock mode.",
                "to": to_email
            }), 200
        
        # Create message
        msg = MIMEMultipart("alternative")
        msg["From"] = from_email
        msg["To"] = to_email
        msg["Subject"] = subject
        
        # Add both plain text and HTML versions
        if text_content:
            part1 = MIMEText(text_content, "plain")
            msg.attach(part1)
        
        if html_content:
            part2 = MIMEText(html_content, "html")
            msg.attach(part2)
        
        # Send email
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.send_message(msg)
        
        return jsonify({
            "status": "sent",
            "message": f"Email sent successfully to {to_email}",
            "to": to_email
        }), 200
        
    except Exception as e:
        print(f"❌ Error sending email: {str(e)}")
        return jsonify({"error": str(e)}), 500


# ==========================================================
# RUN SERVER
# ==========================================================
if __name__ == "__main__":
    import sys
    # Allow port to be set via environment variable or command line
    port = int(os.environ.get("PORT", 5001))  # Default to 5001 if 5000 is busy
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            print(f"Invalid port number: {sys.argv[1]}, using default: {port}")
    
    print(f"\n🚀 Starting Flask server on port {port}...")
    print(f"📡 Backend URL: http://localhost:{port}")
    print(f"💡 Make sure VITE_API_BASE_URL in .env matches this port!\n")
    
    app.run(host="0.0.0.0", port=port, debug=True)
