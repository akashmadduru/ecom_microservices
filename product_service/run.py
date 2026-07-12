import products_route

from db import init_db
from fastapi import FastAPI
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware
from events import lifespan


app = FastAPI(
    title="E-Commerce Distributed Products Service",
    description="Microservice responsible for product management, inventory tracking, and state reconciliation via Kafka Sagas.",
    version="1.0.0",
    lifespan=lifespan
)

origins = ["http://localhost:5173"]

app.include_router(products_route.router)
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])