import os
from flask import Flask, request, jsonify
from sqlalchemy import inspect, text
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from functools import wraps
from werkzeug.security import generate_password_hash, check_password_hash
import jwt
import datetime
import json
from zoneinfo import ZoneInfo
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = Flask(__name__)
CORS(app)

# Configuration
secret_key = os.getenv('SECRET_KEY')
if not secret_key and os.getenv('VERCEL') == '1':
    raise RuntimeError('SECRET_KEY must be configured in production')
app.config['SECRET_KEY'] = secret_key or 'local-development-secret'

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

    # Configure SSL args if connecting to a remote host (remote hosts like Aiven and TiDB Cloud enforce SSL)
    if mysql_url.startswith(('mysql://', 'mysql+pymysql://')) and 'localhost' not in mysql_url and '127.0.0.1' not in mysql_url:
        app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
            "connect_args": {
                "ssl": {"ssl_disabled": False}
            }
        }
else:
    if os.getenv('VERCEL') == '1':
        app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:////tmp/syncra.db'
    else:
        app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///syncra.db'

app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

# Auto-create tables on first request (lazy, error-handled — safe for serverless cold starts)
_tables_created = False

@app.before_request
def create_tables():
    global _tables_created
    if not _tables_created:
        try:
            db.create_all()
            run_schema_migrations()
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
    password_hash = db.Column(db.String(255), nullable=False)
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
    updatedAt = db.Column(db.String(40), nullable=True)
    alarmTone = db.Column(db.String(20), nullable=True, default='classic')
    timezone = db.Column(db.String(64), nullable=True, default='UTC')
    lastReminderSentAt = db.Column(db.String(40), nullable=True)
    duration = db.Column(db.Integer, nullable=True)
    reminders = db.Column(db.Text, nullable=True)
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
            'updatedAt': self.updatedAt,
            'alarmTone': self.alarmTone or 'classic',
            'timezone': self.timezone or 'UTC',
            'lastReminderSentAt': self.lastReminderSentAt,
            'reminders': json.loads(self.reminders) if self.reminders else [],
            'duration': self.duration,
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

class DeletedEvent(db.Model):
    __tablename__ = 'deleted_events'
    id = db.Column(db.String(50), primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    deletedAt = db.Column(db.String(40), nullable=False)

class PushSubscription(db.Model):
    __tablename__ = 'push_subscriptions'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    endpoint = db.Column(db.String(1000), nullable=False)
    subscription_json = db.Column(db.Text, nullable=False)

class EventShare(db.Model):
    __tablename__ = 'event_shares'
    id = db.Column(db.Integer, primary_key=True)
    event_id = db.Column(db.String(50), db.ForeignKey('events.id'), nullable=False)
    owner_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    shared_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    permission = db.Column(db.String(10), nullable=False, default='view')


def run_schema_migrations():
    """Apply numbered, additive migrations without dropping existing data."""
    db.session.execute(text(
        'CREATE TABLE IF NOT EXISTS schema_migrations '
        '(version VARCHAR(32) PRIMARY KEY)'
    ))
    inspector = inspect(db.engine)
    event_columns = {column['name'] for column in inspector.get_columns('events')}
    if 'updatedAt' not in event_columns:
        db.session.execute(text('ALTER TABLE events ADD COLUMN updatedAt VARCHAR(40)'))
    if 'alarmTone' not in event_columns:
        db.session.execute(text("ALTER TABLE events ADD COLUMN alarmTone VARCHAR(20) DEFAULT 'classic'"))
    if 'timezone' not in event_columns:
        db.session.execute(text("ALTER TABLE events ADD COLUMN timezone VARCHAR(64) DEFAULT 'UTC'"))
    if 'lastReminderSentAt' not in event_columns:
        db.session.execute(text('ALTER TABLE events ADD COLUMN lastReminderSentAt VARCHAR(40)'))
    if 'duration' not in event_columns:
        db.session.execute(text('ALTER TABLE events ADD COLUMN duration INTEGER'))
    if 'reminders' not in event_columns:
        db.session.execute(text('ALTER TABLE events ADD COLUMN reminders TEXT'))
    migration_exists = db.session.execute(text(
        "SELECT 1 FROM schema_migrations WHERE version = '001_conflict_resolution'"
    )).first()
    if not migration_exists:
        db.session.execute(text(
            "INSERT INTO schema_migrations (version) VALUES ('001_conflict_resolution')"
        ))
    db.session.commit()

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
        'exp': datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=7)
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
        'exp': datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=7)
    }, app.config['SECRET_KEY'], algorithm="HS256")

    return jsonify({
        'message': 'Logged in successfully',
        'token': token,
        'email': email
    }), 200

@app.route('/api/push/config', methods=['GET'])
def push_config():
    public_key = os.getenv('VAPID_PUBLIC_KEY')
    if not public_key:
        return jsonify({'message': 'Web Push is not configured'}), 503
    return jsonify({'publicKey': public_key}), 200

@app.route('/api/push/subscribe', methods=['POST'])
@token_required
def save_push_subscription(current_user):
    data = request.get_json()
    if not isinstance(data, dict) or not isinstance(data.get('endpoint'), str) or not data.get('keys'):
        return jsonify({'message': 'A valid push subscription is required'}), 400
    subscription_json = json.dumps(data)
    subscription = PushSubscription.query.filter_by(endpoint=data['endpoint']).first()
    if subscription:
        subscription.user_id = current_user.id
        subscription.subscription_json = subscription_json
    else:
        db.session.add(PushSubscription(
            user_id=current_user.id,
            endpoint=data['endpoint'],
            subscription_json=subscription_json
        ))
    db.session.commit()
    return jsonify({'message': 'Push subscription saved'}), 200

@app.route('/api/push/subscribe', methods=['DELETE'])
@token_required
def delete_push_subscription(current_user):
    data = request.get_json() or {}
    if isinstance(data.get('endpoint'), str):
        PushSubscription.query.filter_by(endpoint=data['endpoint'], user_id=current_user.id).delete()
        db.session.commit()
    return jsonify({'message': 'Push subscription removed'}), 200

@app.route('/api/account/password', methods=['PUT'])
@token_required
def change_password(current_user):
    data = request.get_json() or {}
    if not data.get('currentPassword') or not data.get('newPassword') or len(data['newPassword']) < 8:
        return jsonify({'message': 'Current password and a new password of at least 8 characters are required'}), 400
    if not current_user.check_password(data['currentPassword']):
        return jsonify({'message': 'Current password is incorrect'}), 401
    current_user.set_password(data['newPassword'])
    db.session.commit()
    return jsonify({'message': 'Password changed successfully'}), 200

@app.route('/api/account', methods=['DELETE'])
@token_required
def delete_account(current_user):
    EventShare.query.filter((EventShare.owner_id == current_user.id) | (EventShare.shared_user_id == current_user.id)).delete(synchronize_session=False)
    PushSubscription.query.filter_by(user_id=current_user.id).delete()
    db.session.delete(current_user)
    db.session.commit()
    return jsonify({'message': 'Account deleted successfully'}), 200

@app.route('/api/events/<event_id>/shares', methods=['GET', 'POST'])
@token_required
def manage_event_shares(current_user, event_id):
    event = Event.query.filter_by(id=event_id, user_id=current_user.id).first()
    if not event:
        return jsonify({'message': 'Event not found'}), 404
    if request.method == 'GET':
        shares = EventShare.query.filter_by(event_id=event_id, owner_id=current_user.id).all()
        return jsonify([{'email': User.query.get(share.shared_user_id).email, 'permission': share.permission} for share in shares]), 200
    data = request.get_json() or {}
    email = data.get('email', '').strip().lower()
    permission = data.get('permission', 'view')
    shared_user = User.query.filter_by(email=email).first()
    if not shared_user or permission not in ('view', 'edit'):
        return jsonify({'message': 'A valid registered email and permission are required'}), 400
    share = EventShare.query.filter_by(event_id=event_id, shared_user_id=shared_user.id).first()
    if share:
        share.permission = permission
    else:
        db.session.add(EventShare(event_id=event_id, owner_id=current_user.id,
                                  shared_user_id=shared_user.id, permission=permission))
    db.session.commit()
    return jsonify({'message': 'Event shared successfully'}), 201

@app.route('/api/shared/events', methods=['GET'])
@token_required
def get_shared_events(current_user):
    shares = EventShare.query.filter_by(shared_user_id=current_user.id).all()
    events = []
    for share in shares:
        event = Event.query.filter_by(id=share.event_id).first()
        if event:
            event_data = event.to_dict()
            event_data['sharePermission'] = share.permission
            event_data['sharedOwnerId'] = share.owner_id
            events.append(event_data)
    return jsonify(events), 200

@app.route('/api/shared/events/<event_id>', methods=['PUT'])
@token_required
def update_shared_event(current_user, event_id):
    share = EventShare.query.filter_by(event_id=event_id, shared_user_id=current_user.id).first()
    if not share or share.permission != 'edit':
        return jsonify({'message': 'You do not have permission to edit this event'}), 403

    data = request.get_json() or {}
    event = Event.query.filter_by(id=event_id, user_id=share.owner_id).first()
    if not event:
        return jsonify({'message': 'Event not found'}), 404
    required = ('id', 'type', 'title', 'date')
    if any(data.get(key) != getattr(event, key) for key in required[:1]):
        return jsonify({'message': 'Event ID cannot be changed'}), 400
    if data.get('type') != 'task' or not isinstance(data.get('title'), str) or not data['title'].strip() or len(data['title']) > 200:
        return jsonify({'message': 'Invalid event payload'}), 400
    if not isinstance(data.get('date'), str) or len(data['date']) != 10:
        return jsonify({'message': 'Invalid event payload'}), 400

    event.type = data['type']
    event.title = data['title'].strip()
    event.date = data['date']
    event.startTime = data.get('startTime')
    event.endTime = data.get('endTime')
    event.priority = data.get('priority', 'medium')
    event.category = data.get('category')
    event.reminder = data.get('reminder', 'none')
    event.description = data.get('description')
    event.completed = data.get('completed', False)
    event.link = data.get('link')
    event.location = data.get('location')
    event.updatedAt = data.get('updatedAt') or datetime.datetime.now(datetime.timezone.utc).isoformat()
    event.alarmTone = data.get('alarmTone', 'classic')
    event.timezone = data.get('timezone', 'UTC')
    event.duration = data.get('duration')
    event.reminders = json.dumps(data.get('reminders', []))
    for subtask in event.subtasks:
        db.session.delete(subtask)
    for subtask in data.get('subtasks', []):
        db.session.add(Subtask(
            id=subtask['id'], event_id=event.id, text=subtask['text'],
            completed=subtask.get('completed', False)
        ))
    db.session.commit()
    event_data = event.to_dict()
    event_data['sharePermission'] = share.permission
    event_data['sharedOwnerId'] = share.owner_id
    return jsonify(event_data), 200

@app.route('/api/reminders/dispatch', methods=['GET'])
def dispatch_reminders():
    cron_secret = os.getenv('CRON_SECRET')
    if not cron_secret or request.headers.get('Authorization') != f'Bearer {cron_secret}':
        return jsonify({'message': 'Unauthorized'}), 401
    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        return jsonify({'message': 'pywebpush is not installed'}), 503
    private_key = os.getenv('VAPID_PRIVATE_KEY')
    subject = os.getenv('VAPID_SUBJECT', 'mailto:admin@example.com')
    if not private_key:
        return jsonify({'message': 'Web Push is not configured'}), 503

    now_utc = datetime.datetime.now(datetime.timezone.utc)
    sent = 0
    expired = 0
    for event in Event.query.filter(Event.completed.is_(False), Event.startTime.isnot(None)).all():
        reminder_offsets = json.loads(event.reminders) if event.reminders else (
            [] if event.reminder in (None, '', 'none') else [event.reminder]
        )
        if not reminder_offsets:
            continue
        try:
            timezone = ZoneInfo(event.timezone or 'UTC')
            event_date = datetime.datetime.strptime(f'{event.date} {event.startTime}', '%Y-%m-%d %H:%M')
            event_time = event_date.replace(tzinfo=timezone)
        except (ValueError, TypeError, KeyError):
            continue
        for reminder_offset in reminder_offsets:
            try:
                reminder_time = event_time - datetime.timedelta(minutes=int(reminder_offset))
            except (ValueError, TypeError):
                continue
            if not (reminder_time <= now_utc.astimezone(timezone) < event_time + datetime.timedelta(minutes=20)):
                continue
            reminder_key = reminder_time.isoformat()
            if event.lastReminderSentAt == reminder_key:
                continue
            subscriptions = PushSubscription.query.filter_by(user_id=event.user_id).all()
            payload = json.dumps({
                'title': f'Syncra Alarm: {event.title}',
                'body': f'{event.type.title()} reminder for {event.startTime}',
                'eventId': event.id,
                'url': '/'
            })
            delivered = False
            for subscription in subscriptions:
                try:
                    webpush(
                        subscription_info=json.loads(subscription.subscription_json),
                        data=payload,
                        vapid_private_key=private_key,
                        vapid_claims={'sub': subject}
                    )
                    delivered = True
                    sent += 1
                except WebPushException as error:
                    if getattr(error, 'response', None) is not None and error.response.status_code in (404, 410):
                        db.session.delete(subscription)
                        expired += 1
            if delivered:
                event.lastReminderSentAt = reminder_key
    db.session.commit()
    return jsonify({'sent': sent, 'expiredSubscriptions': expired}), 200

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
    deleted_ids = data.get('deletedIds', [])
    if not isinstance(payload_events, list) or not isinstance(deleted_ids, list):
        return jsonify({'message': 'Events and deletedIds must be lists'}), 400

    def validate_event(event):
        required = ('id', 'type', 'title', 'date')
        if not isinstance(event, dict) or any(not event.get(key) for key in required):
            return False
        if event['type'] != 'task':
            return False
        if not isinstance(event['id'], str) or len(event['id']) > 50:
            return False
        if not isinstance(event['title'], str) or len(event['title']) > 200:
            return False
        if not isinstance(event['date'], str) or len(event['date']) != 10:
            return False
        subtasks = event.get('subtasks', [])
        return isinstance(subtasks, list) and all(
            isinstance(subtask, dict)
            and isinstance(subtask.get('id'), str)
            and len(subtask['id']) <= 50
            and isinstance(subtask.get('text'), str)
            and subtask['text'].strip()
            and len(subtask['text']) <= 250
            for subtask in subtasks
        )

    if not all(validate_event(event) for event in payload_events):
        return jsonify({'message': 'Invalid event payload'}), 400
    normalized_deletes = []
    for deleted in deleted_ids:
        if isinstance(deleted, str):
            normalized_deletes.append({'id': deleted, 'updatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()})
        elif isinstance(deleted, dict) and isinstance(deleted.get('id'), str) and len(deleted['id']) <= 50:
            normalized_deletes.append({
                'id': deleted['id'],
                'updatedAt': deleted.get('updatedAt') or datetime.datetime.now(datetime.timezone.utc).isoformat()
            })
        else:
            return jsonify({'message': 'Invalid deleted event ID'}), 400
    if not all(isinstance(deleted['updatedAt'], str) for deleted in normalized_deletes):
        return jsonify({'message': 'Invalid deleted event ID'}), 400

    payload_ids = {event['id'] for event in payload_events}
    deleted_id_set = {deleted['id'] for deleted in normalized_deletes}
    if len(payload_ids) != len(payload_events) or payload_ids.intersection(deleted_id_set):
        return jsonify({'message': 'Duplicate or conflicting event IDs'}), 400

    # Fetch existing db items
    db_events = Event.query.filter_by(user_id=current_user.id).all()
    db_ids = {e.id for e in db_events}

    # Delete only records explicitly removed by the client. Missing payload items
    # remain untouched so stale or offline clients cannot erase server data.
    for deleted in normalized_deletes:
        event_id = deleted['id']
        event = Event.query.filter_by(id=event_id, user_id=current_user.id).first()
        if event and (not event.updatedAt or deleted['updatedAt'] >= event.updatedAt):
            db.session.delete(event)
        tombstone = DeletedEvent.query.filter_by(id=event_id).first()
        if not tombstone or deleted['updatedAt'] > tombstone.deletedAt:
            if tombstone:
                tombstone.deletedAt = deleted['updatedAt']
                tombstone.user_id = current_user.id
            else:
                db.session.add(DeletedEvent(id=event_id, user_id=current_user.id, deletedAt=deleted['updatedAt']))

    # Insert or update payload events belonging to the authenticated user.
    for p_ev in payload_events:
        incoming_updated_at = p_ev.get('updatedAt') or datetime.datetime.now(datetime.timezone.utc).isoformat()
        if p_ev['id'] in db_ids:
            # Update
            db_ev = Event.query.filter_by(id=p_ev['id']).first()
            if db_ev.updatedAt and incoming_updated_at <= db_ev.updatedAt:
                continue
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
            db_ev.updatedAt = incoming_updated_at
            db_ev.alarmTone = p_ev.get('alarmTone', 'classic')
            db_ev.timezone = p_ev.get('timezone', 'UTC')
            db_ev.duration = p_ev.get('duration')
            db_ev.reminders = json.dumps(p_ev.get('reminders', []))

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
            existing_event = Event.query.filter_by(id=p_ev['id']).first()
            if existing_event:
                return jsonify({'message': 'Event ID belongs to another user'}), 409
            tombstone = DeletedEvent.query.filter_by(id=p_ev['id']).first()
            if tombstone and tombstone.deletedAt >= incoming_updated_at:
                continue
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
                location=p_ev.get('location'),
                updatedAt=incoming_updated_at,
                alarmTone=p_ev.get('alarmTone', 'classic'),
                timezone=p_ev.get('timezone', 'UTC'),
                duration=p_ev.get('duration'),
                reminders=json.dumps(p_ev.get('reminders', []))
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
    events = Event.query.filter_by(user_id=current_user.id).all()
    return jsonify({'message': 'Synchronization successful', 'events': [event.to_dict() for event in events]}), 200

if __name__ == '__main__':
    # Run server on port 5000
    app.run(host='0.0.0.0', port=5000, debug=True)