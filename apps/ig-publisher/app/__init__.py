"""Virus IG Publisher — FastAPI service that posts carousels to Instagram.

Architecture:
    Vercel (web/worker)  ──HMAC──▶  Railway (this service)  ──▶  Instagram (private API)
                                            │
                                            └──▶  Supabase (Vault, accounts, publications)
"""

__version__ = "0.1.0"
