from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ApiModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class TransactionInput(ApiModel):
    transaction_id: str = Field(min_length=1)
    card_id: str = Field(min_length=1)
    timestamp: datetime
    amount: float = Field(ge=0, allow_inf_nan=False)
    merchant_category: str = Field(min_length=1)
    country: str = Field(min_length=1)
    home_country: str = Field(min_length=1)

    @field_validator("timestamp")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError(
                "timestamp must include a timezone, such as Z or +00:00"
            )

        return value


class ScoreRequest(ApiModel):
    transaction: TransactionInput
    previous_transactions: list[TransactionInput] = Field(
        default_factory=list,
        max_length=1000,
    )


class ScoreResponse(ApiModel):
    transaction_id: str
    model: str
    risk_score: float = Field(ge=0, le=1, allow_inf_nan=False)
    threshold: float = Field(ge=0, le=1, allow_inf_nan=False)
    flagged_for_review: bool
