import os

# Settings are required at import time; use harmless test values.
os.environ["S3_BUCKET"] = "test-bucket"
os.environ["S3_ACCESS_KEY"] = "test-access-key"
os.environ["S3_SECRET_KEY"] = "test-secret-key"
os.environ["S3_ENDPOINT"] = "http://localhost:9000"
