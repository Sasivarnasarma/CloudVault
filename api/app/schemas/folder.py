from pydantic import BaseModel, Field
from app.schemas.storage import FolderItem


class CreateFolderRequest(BaseModel):
    path: str = Field(
        description="Target folder path to create, e.g. documents/projects"
    )


class CreateFolderResponse(BaseModel):
    success: bool
    folder: FolderItem


class DeleteFolderResponse(BaseModel):
    success: bool
    prefix: str
    deleted_count: int
