"""
backend/schemas/auth.py
-----------------------
Pydantic v2 request / response schemas for the auth router.
"""

from datetime import datetime
from pydantic import BaseModel, EmailStr, Field, field_validator


class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=120, examples=["John Doe"])
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128, examples=["s3cur3P@ss"])

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if v.isdigit():
            raise ValueError("Password must not be all digits")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1)


class TokenResponse(BaseModel):
    token: str
    token_type: str = "bearer"
    user: "UserOut"


class UserOut(BaseModel):
    id: int
    name: str
    email: EmailStr
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# Allow forward ref resolution
TokenResponse.model_rebuild()
