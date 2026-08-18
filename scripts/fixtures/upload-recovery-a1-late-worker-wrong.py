def _submission_gallery_reset_blocking(data, nonce):
    claims = session_claims(data.get("session", ""))
    with conn.transaction():
        cur.execute("SELECT status,email FROM listing_submissions WHERE id=%s FOR UPDATE")
        sub = cur.fetchone()
        if not sub or sub["email"] != claims["e"]: raise HTTPException(404, "no such submission")
        if sub["status"] != "draft": raise HTTPException(409, "submission is not accepting images")
        cur.execute("DELETE FROM submission_images WHERE submission_id=%s")
        cur.execute("DELETE FROM submission_upload_tickets WHERE submission_id=%s")

@app.post("/submission/gallery-reset")
async def submission_gallery_reset(): pass

def _upload_claim_blocking(digest):
    return {"submission_id": 42, "position": 0}

def _upload_ingest_blocking(tk, tmp_path):
    cur.execute("SELECT status FROM listing_submissions WHERE id=%s FOR UPDATE")
    ingest_image(tk, tmp_path)
