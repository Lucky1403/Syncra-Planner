import os
from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from functools import wraps
from werkzeug.security import generate_password_hash, check_password_hash
import jwt
import datetime
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = Flask(__name__)
CORS(app)

# Configuration
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'super-secret-key-change-me-in-production')

# Database Connection Setup (MySQL / SQLite Fallback)
mysql_url = os.getenv('DATABASE_URL')
if mysql_url:
    # Auto-adjust driver prefix if user pasted raw mysql:// (SQLAlchemy requires driver specification)
    if mysql_url.startswith('mysql://'):
        mysql_url = mysql_url.replace('mysql://', 'mysql+pymysql://', 1)
        
    # Strip ssl-mode parameters from query string to avoid SQLAlchemy/pymysql dialect init crashes
    if '?' in mysql_url:
        parts = mysql_url.split('?', 1)
        base_url = parts[0]
        query_params = parts[1].split('&')
        cleaned_params = [p for p in query_params if not p.lower().startswith('ssl-mode') and not p.lower().startswith('ssl_mode')]
        if cleaned_params:
            mysql_url = base_url + '?' + '&'.join(cleaned_params)
        else:
            mysql_url = base_url
            
    # URL encode password to handle special characters (@, :, /, etc.) in password
    from urllib.parse import urlparse, quote_plus, urlunparse
    try:
        parsed = urlparse(mysql_url)
        if parsed.password:
            encoded_password = quote_plus(parsed.password)
            netloc = parsed.username
            if encoded_password:
                netloc += f":{encoded_password}"
            netloc += f"@{parsed.hostname}"
            if parsed.port:
                netloc += f":{parsed.port}"
            
            parsed_list = list(parsed)
            parsed_list[1] = netloc
            mysql_url = urlunparse(parsed_list)
    except Exception as e:
        print("Database URL password encoding failed:", e)
        
    app.config['SQLALCHEMY_DATABASE_URI'] = mysql_url
    
    # Configure SSL args if Aiven cloud hostname is detected (Aiven enforces SSL connections)
    if 'aivencloud.com' in mysql_url:
        app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
            "connect_args": {
                "ssl": {}
            }
        }
else:
    if os.getenv('VERCEL') == '1':
        app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:////tmp/syncra.db'
    else:
        app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///syncra.db'

app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

# Auto-create tables on first request
_tables_created = False

@app.before_request
def create_tables():
    global _tables_created
    if not _tables_created:
        try:
            db.create_all()
            _tables_created = True
        except Exception as e:
            app.logger.error(f"Database table creation failed: {e}")

import traceback
from werkzeug.exceptions import HTTPException

@app.errorhandler(Exception)
def handle_exception(e):
    if isinstance(e, HTTPException):
        return e
    tb = traceback.format_exc()
    print("SERVER ERROR:", tb)
    return jsonify({
        "message": f"Server Error: {str(e)}"
    }), 500

# --- Database Models ---

class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    events = db.relationship('Event', backref='user', lazy=True, cascade="all, delete-orphan")

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

class Event(db.Model):
    __tablename__ = 'events'
    id = db.Column(db.String(50), primary_key=True) # Matches client generated UUID/timestamp string
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    type = db.Column(db.String(20), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    date = db.Column(db.String(10), nullable=False)
    startTime = db.Column(db.String(5), nullable=True)
    endTime = db.Column(db.String(5), nullable=True)
    priority = db.Column(db.String(10), nullable=False, default='medium')
    category = db.Column(db.String(50), nullable=True)
    reminder = db.Column(db.String(10), nullable=False, default='none')
    description = db.Column(db.Text, nullable=True)
    completed = db.Column(db.Boolean, default=False)
    dismissedAlarm = db.Column(db.Boolean, default=False)
    link = db.Column(db.String(500), nullable=True)
    location = db.Column(db.String(200), nullable=True)
    subtasks = db.relationship('Subtask', backref='event', lazy=True, cascade="all, delete-orphan")

    def to_dict(self):
        return {
            'id': self.id,
            'type': self.type,
            'title': self.title,
            'date': self.date,
            'startTime': self.startTime,
            'endTime': self.endTime,
            'priority': self.priority,
            'category': self.category,
            'reminder': self.reminder,
            'description': self.description,
            'completed': self.completed,
            'dismissedAlarm': self.dismissedAlarm,
            'link': self.link,
            'location': self.location,
            'subtasks': [s.to_dict() for s in self.subtasks]
        }

class Subtask(db.Model):
    __tablename__ = 'subtasks'
    id = db.Column(db.String(50), primary_key=True)
    event_id = db.Column(db.String(50), db.ForeignKey('events.id'), nullable=False)
    text = db.Column(db.String(250), nullable=False)
    completed = db.Column(db.Boolean, default=False)

    def to_dict(self):
        return {
            'id': self.id,
            'text': self.text,
            'completed': self.completed
        }

# Create tables if they do not exist
with app.app_context():
    db.create_all()

# --- Auth Middleware ---

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            if auth_header.startswith('Bearer '):
                token = auth_header.split(" ")[1]
        
        if not token:
            return jsonify({'message': 'Authorization token is missing!'}), 401
            
        try:
            data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
            current_user = User.query.filter_by(id=data['user_id']).first()
            if not current_user:
                return jsonify({'message': 'Invalid user account!'}), 401
        except jwt.ExpiredSignatureError:
            return jsonify({'message': 'Token has expired!'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'message': 'Invalid token!'}), 401
            
        return f(current_user, *args, **kwargs)
    return decorated

# --- Routes ---

@app.route('/api/auth/signup', methods=['POST'])
def signup():
    data = request.get_json()
    if not data or not data.get('email') or not data.get('password'):
        return jsonify({'message': 'Missing email or password'}), 400
        
    email = data['email'].strip().lower()
    password = data['password']
    
    if User.query.filter_by(email=email).first():
        return jsonify({'message': 'User already exists'}), 409
        
    new_user = User(email=email)
    new_user.set_password(password)
    db.session.add(new_user)
    db.session.commit()
    
    # Generate Token
    token = jwt.encode({
        'user_id': new_user.id,
        'exp': datetime.datetime.utcnow() + datetime.timedelta(days=7)
    }, app.config['SECRET_KEY'], algorithm="HS256")
    
    return jsonify({
        'message': 'User created successfully',
        'token': token,
        'email': email
    }), 201

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json()
    if not data or not data.get('email') or not data.get('password'):
        return jsonify({'message': 'Missing email or password'}), 400
        
    email = data['email'].strip().lower()
    password = data['password']
    
    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(password):
        return jsonify({'message': 'Invalid email or password'}), 401
        
    # Generate Token
    token = jwt.encode({
        'user_id': user.id,
        'exp': datetime.datetime.utcnow() + datetime.timedelta(days=7)
    }, app.config['SECRET_KEY'], algorithm="HS256")
    
    return jsonify({
        'message': 'Logged in successfully',
        'token': token,
        'email': email
    }), 200

@app.route('/api/events', methods=['GET'])
@token_required
def get_events(current_user):
    events = Event.query.filter_by(user_id=current_user.id).all()
    return jsonify([e.to_dict() for e in events]), 200

@app.route('/api/events/sync', methods=['POST'])
@token_required
def sync_events(current_user):
    data = request.get_json()
    if not data or 'events' not in data:
        return jsonify({'message': 'Events payload is required'}), 400
        
    payload_events = data['events']
    payload_ids = {e['id'] for e in payload_events}
    
    # Fetch existing db items
    db_events = Event.query.filter_by(user_id=current_user.id).all()
    db_ids = {e.id for e in db_events}
    
    # 1. Delete events from database that are not in the payload
    for e in db_events:
        if e.id not in payload_ids:
            db.session.delete(e)
            
    # 2. Insert/Update payload events
    for p_ev in payload_events:
        if p_ev['id'] in db_ids:
            # Update
            db_ev = Event.query.filter_by(id=p_ev['id']).first()
            db_ev.type = p_ev['type']
            db_ev.title = p_ev['title']
            db_ev.date = p_ev['date']
            db_ev.startTime = p_ev.get('startTime')
            db_ev.endTime = p_ev.get('endTime')
            db_ev.priority = p_ev.get('priority', 'medium')
            db_ev.category = p_ev.get('category')
            db_ev.reminder = p_ev.get('reminder', 'none')
            db_ev.description = p_ev.get('description')
            db_ev.completed = p_ev.get('completed', False)
            db_ev.dismissedAlarm = p_ev.get('dismissedAlarm', False)
            db_ev.link = p_ev.get('link')
            db_ev.location = p_ev.get('location')
            
            # Re-sync subtasks
            # Delete old db subtasks
            for s in db_ev.subtasks:
                db.session.delete(s)
            # Insert payload subtasks
            if 'subtasks' in p_ev:
                for p_sub in p_ev['subtasks']:
                    new_sub = Subtask(
                        id=p_sub['id'],
                        event_id=db_ev.id,
                        text=p_sub['text'],
                        completed=p_sub.get('completed', False)
                    )
                    db.session.add(new_sub)
        else:
            # Create new
            new_ev = Event(
                id=p_ev['id'],
                user_id=current_user.id,
                type=p_ev['type'],
                title=p_ev['title'],
                date=p_ev['date'],
                startTime=p_ev.get('startTime'),
                endTime=p_ev.get('endTime'),
                priority=p_ev.get('priority', 'medium'),
                category=p_ev.get('category'),
                reminder=p_ev.get('reminder', 'none'),
                description=p_ev.get('description'),
                completed=p_ev.get('completed', False),
                dismissedAlarm=p_ev.get('dismissedAlarm', False),
                link=p_ev.get('link'),
                location=p_ev.get('location')
            )
            db.session.add(new_ev)
            
            if 'subtasks' in p_ev:
                for p_sub in p_ev['subtasks']:
                    new_sub = Subtask(
                        id=p_sub['id'],
                        event_id=new_ev.id,
                        text=p_sub['text'],
                        completed=p_sub.get('completed', False)
                    )
                    db.session.add(new_sub)
                    
    db.session.commit()
    return jsonify({'message': 'Synchronization successful'}), 200

if __name__ == '__main__':
    # Run server on port 5000
    app.run(host='0.0.0.0', port=5000, debug=True)
