# Inventory Manager

A FastAPI-based inventory management system with SQLite database and web frontend.

## Features

- **RESTful API**: Built with FastAPI for managing inventory items
- **Web Interface**: Simple HTML/CSS/JavaScript frontend for easy interaction
- **SQLite Database**: Lightweight database for storing inventory data
- **CRUD Operations**: Create, Read, Update, and Delete inventory items

## API Endpoints

### GET `/api/hello`
Returns a welcome message.

### GET `/api/items`
Returns all inventory items.

Response:
```json
[
  {
    "id": 1,
    "item_number": 100,
    "value": true
  }
]
```

### POST `/api/items`
Create a new inventory item.

Request body:
```json
{
  "item_number": 100,
  "value": true
}
```

### PUT `/api/items/{item_id}`
Update an item's value.

Query parameter: `value` (boolean)

### DELETE `/api/items/{item_id}`
Delete an item.

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Run the server:
```bash
uvicorn main:app --reload
```

3. Open your browser to http://localhost:8000

## Project Structure

```
.
├── main.py              # FastAPI application
├── inventory.db         # SQLite database
├── static/             # Frontend files
│   ├── index.html
│   ├── app.js
│   └── style.css
├── requirements.txt     # Python dependencies
├── README.md           # This file
└── .gitignore          # Git ignore rules
```

## Technologies Used

- **FastAPI** - Modern Python web framework
- **SQLite** - Database
- **HTML/CSS/JavaScript** - Frontend
- **Pydantic** - Data validation