from pydantic import BaseModel
from pydantic import BaseModel, ConfigDict

class ProductBase(BaseModel):
    uniq_id: str 
    created_at: str 
    product_url: str 
    product_name: str  
    retail_price: float 
    discount: float 
    image_urls: str 
    description: str 
    category: str 
    sub_category: str 
    rating: int
    brand: str 

class ProductCreate(ProductBase):
    pass

class Product(ProductBase):
    id: int
    page: int
    size: int

    model_config = ConfigDict(from_attributes=True)