from flask import Flask, Response, jsonify
import requests

app = Flask(__name__)

@app.route("/")
def home():
    return "Backend is running. Try /api/balloons/0"

@app.route("/api/balloons/<hour>")
def get_balloons(hour):
    """
    Proxy endpoint: fetches a specific hour from WindBorne's API
    and returns it with CORS headers so the browser is happy.
    """
    try:
        hour_int = int(hour)
    except ValueError:
        return jsonify({"error": "hour must be an integer between 0 and 23"}), 400

    if not (0 <= hour_int <= 23):
        return jsonify({"error": "hour must be between 0 and 23"}), 400

    hour_str = f"{hour_int:02d}"
    upstream_url = f"https://a.windbornesystems.com/treasure/{hour_str}.json"

    try:
        upstream_response = requests.get(upstream_url, timeout=10)
        upstream_response.raise_for_status()
    except requests.RequestException as e:
        return jsonify({"error": "Failed to fetch from WindBorne", "details": str(e)}), 502

    resp = Response(
        upstream_response.content,
        status=upstream_response.status_code,
        mimetype="application/json"
    )
    resp.headers["Access-Control-Allow-Origin"] = "*"
    return resp

if __name__ == "__main__":
    app.run(debug=True)
