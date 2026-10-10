from pydantic import BaseModel, Field

from app.schemas.storage import FolderItem


class CreateFolderRequest(BaseModel):
    path: str = Field(description="Target folder path to create, e.g. documents/projects")


class CreateFolderResponse(BaseModel):
    success: bool
    folder: FolderItem


class TransferFolderRequest(BaseModel):
    source: str = Field(description="Existing folder path, e.g. documents/2025")
    destination: str = Field(description="New folder path, e.g. archive/2025")


class TransferFolderResponse(BaseModel):
    success: bool
    source: str
    destination: str
    item_count: int


class DeleteFolderResponse(BaseModel):
    success: bool
    prefix: str
    deleted_count: int
