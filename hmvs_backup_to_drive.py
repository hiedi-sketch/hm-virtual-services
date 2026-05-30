import os
import io
import requests
from datetime import date

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload


BACKUP_API_URL = "https://hmvirtualservices.com/api/backup/json"
SCOPES = ["https://www.googleapis.com/auth/drive.file"]


def get_drive_service():
    creds = Credentials(
        token=None,
        refresh_token=os.environ["GOOGLE_REFRESH_TOKEN"],
        token_uri="https://oauth2.googleapis.com/token",
        client_id=os.environ["GOOGLE_CLIENT_ID"],
        client_secret=os.environ["GOOGLE_CLIENT_SECRET"],
        scopes=SCOPES,
    )
    creds.refresh(Request())
    return build("drive", "v3", credentials=creds)


def download_backup():
    token = os.environ["BACKUP_API_TOKEN"]
    response = requests.get(
        BACKUP_API_URL,
        headers={"Authorization": f"Bearer {token}"},
        timeout=60,
    )
    response.raise_for_status()
    return response.content


def upload_to_drive(service, file_bytes, filename, folder_id):
    query = f"name='{filename}' and '{folder_id}' in parents and trashed=false"
    existing = service.files().list(q=query, fields="files(id, name)").execute()
    existing_files = existing.get("files", [])

    media = MediaIoBaseUpload(
        io.BytesIO(file_bytes),
        mimetype="application/json",
        resumable=True,
    )

    if existing_files:
        file_id = existing_files[0]["id"]
        service.files().update(fileId=file_id, media_body=media).execute()
        print(f"Updated existing file: {filename} (id: {file_id})")
    else:
        metadata = {
            "name": filename,
            "parents": [folder_id],
            "mimeType": "application/json",
        }
        result = (
            service.files()
            .create(
                body=metadata,
                media_body=media,
                fields="id, name",
            )
            .execute()
        )
        print(f"Created new file: {filename} (id: {result['id']})")


def run_backup():
    filename = f"hmvs-backup-{date.today().isoformat()}.json"

    print(f"[backup] Starting backup: {filename}")
    print("[backup] Downloading from API...")
    file_bytes = download_backup()
    size_kb = len(file_bytes) / 1024
    print(f"[backup] Downloaded {size_kb:.1f} KB")

    print("[backup] Authenticating with Google Drive...")
    service = get_drive_service()
    folder_id = os.environ["BACKUP_FOLDER_ID"]

    print(f"[backup] Uploading to Drive folder {folder_id}...")
    upload_to_drive(service, file_bytes, filename, folder_id)

    print(f"[backup] Done. {filename} ({size_kb:.1f} KB) uploaded successfully.")
    return {"status": "ok", "filename": filename, "size_kb": round(size_kb, 1)}


if __name__ == "__main__":
    run_backup()
