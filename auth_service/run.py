import user_route
from event import lifespan
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# FastAPI Init
app = FastAPI(
    title="E-Commerce Secure Auth Service",
    description="Microservice responsible for asynchronous user auth, JWT validation, and RBAC via PostgreSQL and Redis",
    version="1.0.0",
    lifespan=lifespan
)

app.include_router(user_route.router)


origins = ["http://localhost:5173"]

app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])