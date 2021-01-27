import express      from 'express';
import http         from 'http';
import socketIO     from 'socket.io';
import mongoose     from 'mongoose';
import bodyParser   from 'body-parser';
import jwt          from 'jsonwebtoken'; 
import bcrypt       from 'bcryptjs';
import config       from '../config';
import User         from './models/user';
import Location     from './models/location';
import View         from './models/view';
import tokenAuth    from './libraries/tokenAuth';
import permissions  from './libraries/permissions';

// ===============================
//               Init
// ===============================

mongoose.connect(config.database, {useMongoClient: true});
const app = express();
const router = express.Router();
const server = http.Server(app);
const io = socketIO(server, {transports: ['polling']});
const CURRENT_USER = 'CURRENT_USER';
const emit = (key, data) => {
    io.sockets.emit(key, data);    
};

app.set('superSecret', config.secret); 
tokenAuth.secret = app.get('superSecret');
tokenAuth.expiry = config.tokenExpiry;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(function(req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS, POST, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, Accept, X-Requested-With, Content-Type, X-Access-Token');
    res.setHeader('Cache-Control', 'no-cache');
    next();
});

app.use(bodyParser.json({
    limit : config.bodyLimit
}));

const createUser = (kwargs, callback) => {
    User.create({...kwargs, salt: bcrypt.genSaltSync(4).slice(-8)}, (err, user) => {
        if(err) return callback(err);
        callback(user);
    });
};

const handleError = (res, err) => {
    return res.json({err});
};

// ===============================
//              Auth
// ===============================

router.use([
    '/locations', 
    '/locations/:name', 
    '/views', 
    '/views/:name', 
    '/users', 
    '/users/:name'
],
tokenAuth.authenticate
);

// ===============================
//           Permissions
// ===============================

router.use([
    '/locations', 
    '/locations/:name', 
    '/views', 
    '/views/:name'
], 
[
    permissions(
        [
            'DELETE'
        ],
        [
            'admin'
        ]
    ),
    permissions(
        [
            'GET'
        ],
        [
            'user'
        ]
    )
]);

router.use([
    '/users', 
    '/users/:eid'
], 
[
    permissions(
        [
            'PATCH',
            'PUT'
        ],
        [
            'admin'
        ],
        [
            CURRENT_USER
        ]
    ),
    permissions(
        [
            'DELETE'
        ],
        [
            'admin'
        ]
    )
]);

// ===============================
//             Routes
// ===============================

router.get('/', (req, res) => {
    return res.json({msg: 'API Initialized!', "auth-user": req.headers["auth-user"]});
});

router.route('/admin')
.get((req, res) => {
    User.find({}, (err, users) => {
        if (err) return handleError(res, err);
        if(!users.length) {
            createUser({
                eid: req.headers["auth-user"], 
                name: req.query.name, 
                email: req.query.email, 
                roles: ['admin', 'user'], 
                enabled: true
            }, (user) => {
                if(user.code) return res.json(user);
                return res.json({msg: 'Admin successfully added!', user});
            });
        }    
        else {
            return res.json({msg: 'Admin already created'});
        }
    });
})

// Token Issuer //
router.route('/auth').get(tokenAuth.issueToken);

// All Locations //
router.route('/locations')
.get((req, res) => {
    Location
        .find({})
        // .populate('views')
        .exec((err, locations) => {
        if (err) return handleError(res, err);
        return res.json(locations);
    });
}).post((req, res) => {
    const location = new Location();

    location.name = req.body.name;
    location.monitors = req.body.monitors;
    location.views = req.body.views;

    location.save((err) => {
        if (err) {
            if(err.code === 11000) {
                Location
                    .findOne({name: req.body.name})
                    // .populate('views')
                    .exec((err, location) => {
                        if (err) return handleError(res, err);
                        return res.json({err: 'Location alread exists!', data: location});
            
                    });
            }
            else {
                return handleError(res, err);
            }
        }
        else {
            emit('location:create', location);
            return res.json({msg: 'Location successfully created!', data: location});
        }
    });
});

// Unique Location //
router.route('/locations/:name')
.get((req, res) => {
    Location
        .findOne({name: req.params.name})
        .populate('views')
        .exec((err, location) => {
            if (err) return handleError(res, err);
            return res.json(location);
        });
})
.patch((req, res) => {
    Location
        .findOneAndUpdate({name: req.params.name}, req.body, {upsert: false, new: true})
        .populate('views')
        .exec((err, location) => {
            if (err) return handleError(res, err);
            emit('location:update', location);
            return res.json({msg: 'Location successfully updated!', data: location, changes: req.body});
        });
})
.delete((req, res) => {
    Location
        .findOneAndRemove({
            name: req.params.name
        }, (err, location) => {
            if (err) return handleError(res, err);
            emit('location:delete', {deleted: req.params.name});
            res.json({msg: 'Location successfully deleted!'});
        });
});

// All Views //
router.route('/views')
.get((req, res) => {
    View.find((err, views) => {
        if (err) return handleError(res, err);
        return res.json(views)
    });
}).post((req, res) => {
    const view = new View();

    view.name = req.body.name;
    view.urls = req.body.urls;
    view.timings = req.body.timings;
    view.cookies = req.body.cookies;
    view.reload = req.body.reload;

    view.save((err) => {
        if (err) {
            if(err.code === 11000) {
                View.findOne({name: req.body.name}, (err, view) => {
                    if (err) return handleError(res, err);
                    return res.json(view);
                });
            }
            else {
                return handleError(res, err);
            }
        }
        else {
            emit('view:create', view);
            return res.json({msg: 'View successfully created!', data: view});
        }
    });
});

// Unique View //
router.route('/views/:name')
.get((req, res) => {
    View.findOne({name: req.params.name}, (err, view) => {
        if (err) return handleError(res, err);
        return res.json(view)
    });
})
.patch((req, res) => {
    View.findOneAndUpdate({name: req.params.name}, req.body, {upsert: false, new: true}, (err, view) => {
        if (err) return handleError(res, err);
        emit('view:update', view);
        Location.find({views:view.id})
            // .populate('views')
            .exec((err, locations) => {
                if(locations) {
                    locations.forEach((location) => {
                        emit('view-location:update', location);
                    });
                }
            });
        return res.json({msg: 'View successfully updated!'});
    });
})
.delete((req, res) => {
    View.findOneAndRemove({
        name: req.params.name
    }, (err, view) => {
        if (err) return handleError(res, err);
        emit('view:delete', {deleted: req.params.name});
        return res.json({msg: 'View successfully deleted!'});
    });
});

// Users //
router.route('/users')
.get((req, res) => {
    User.find((err, users) => {
        if (err) return handleError(res, err);
        return res.json(users);
    });
})
.post((req, res) => {
    createUser({
        eid: req.body.eid, 
        name: req.body.name, 
        email: req.body.email, 
        roles: ['user'], 
        enabled: req.body.enabled
    }, (user) => {
        if(user.code) return handleError(res, user);
        console.log('this is here');
        return res.json({msg: 'User successfully added!', data: user});
    });
});

// Unique User //
router.route('/users/:domain/:eid')
.get((req, res) => {
    const eid = `${req.params.domain}\\${req.params.eid}`;
    User.findOne({eid}, (err, user) => {
        if (err) return handleError(res, err);
        return res.json(user)
    });
})
.patch((req, res) => {
    const eid = `${req.params.domain}\\${req.params.eid}`;    
    User.findOneAndUpdate({eid}, req.body, {upsert: false, new: true}, (err, view) => {
        if (err) return handleError(res, err);
        return res.json({msg: 'User successfully updated!'});
    });
})
.delete((req, res) => {
    const eid = `${req.params.domain}\\${req.params.eid}`;
    User.findOneAndRemove({eid}, (err, view) => {
        if (err) return handleError(res, err);
        return res.json({msg: 'User successfully deleted!'});
    });
});

// Apply routes
app.use('/', router);

server.listen(config.port, () => {
    const host = server.address().address;
    const port = server.address().port;
    console.log(`Server running at: http://${host}:${port}`);
});
