from db import Base
from sqlalchemy import Column, Integer, String, Float

class Products(Base):
    __tablename__ = 'products'
    id = Column(Integer, primary_key=True, index=True)
    uniq_id: str = Column(String)
    created_at: str = Column(String)
    product_url: str = Column(String)
    product_name: str  = Column(String)
    retail_price: float = Column(Float)
    discount: float = Column(Float)
    image_urls: str = Column(String)
    description: str = Column(String)
    category: str = Column(String)
    sub_category: str = Column(String)
    rating: int = Column(Integer)
    brand: str = Column(String)