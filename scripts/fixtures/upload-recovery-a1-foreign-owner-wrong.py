def _submission_gallery_reset_blocking(data, nonce):
    with conn.transaction():
        cur.execute("SELECT status,email,gallery_epoch FROM listing_submissions WHERE id=%s FOR UPDATE")
        sub = cur.fetchone()
        if sub["status"] != "draft": raise HTTPException(409, "submission is not accepting images")
        cur.execute("UPDATE listing_submissions SET gallery_epoch=gallery_epoch+1 WHERE id=%s")
        cur.execute("DELETE FROM submission_images WHERE submission_id=%s")
        cur.execute("DELETE FROM submission_upload_tickets WHERE submission_id=%s")

@app.post("/submission/gallery-reset")
async def submission_gallery_reset(): pass

def _upload_claim_blocking(digest):
    cur.execute("SELECT gallery_epoch FROM submission_upload_tickets")

def _upload_ingest_blocking(tk, tmp_path):
    cur.execute("SELECT status,gallery_epoch FROM listing_submissions WHERE id=%s FOR UPDATE")
    if tk["gallery_epoch"] != sub["gallery_epoch"]: raise HTTPException(409, "stale upload after reset")
