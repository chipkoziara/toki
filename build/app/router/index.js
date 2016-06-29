'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});

var _request = require('request');

var _request2 = _interopRequireDefault(_request);

var _dotenv = require('dotenv');

var _dotenv2 = _interopRequireDefault(_dotenv);

var _signup = require('./routes/signup');

var _signup2 = _interopRequireDefault(_signup);

var _login = require('./routes/login');

var _login2 = _interopRequireDefault(_login);

var _invite = require('./routes/invite');

var _invite2 = _interopRequireDefault(_invite);

var _tasks = require('../api/v1/tasks');

var _tasks2 = _interopRequireDefault(_tasks);

var _users = require('../api/v1/users');

var _users2 = _interopRequireDefault(_users);

var _slack_users = require('../api/v1/slack_users');

var _slack_users2 = _interopRequireDefault(_slack_users);

var _models = require('../models');

var _models2 = _interopRequireDefault(_models);

var _slack = require('../lib/slack');

var _slack2 = _interopRequireDefault(_slack);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// sequelize models


// our various routes

exports.default = function (app) {

	var org = "tokibot1";
	var interval = 5000;
	var token = process.env.TOKI_TOKEN_1;

	// fetch data
	var slack = new _slack2.default({ token: token, interval: interval, org: org });
	slack.setMaxListeners(Infinity);

	app.use(function (req, res, next) {
		console.log("\n\n ~~ slack is ready ~~ \n\n");
		console.log(req.body);
		console.log("\n\n\n");
		if (slack.ready) return next();
		slack.once('ready', next);
	});

	// root
	app.get('/', function (req, res) {
		var org = "tokibot1";
		res.render('root', { org: org });
	});

	app.use('/invite', _invite2.default);

	// web app
	app.use('/new', _signup2.default);
	app.use('/login', _login2.default);

	// api
	app.use('/api/v1/tasks', _tasks2.default);
	app.use('/api/v1/users', _users2.default);
	app.use('/api/v1/slack_users', _slack_users2.default);
};

// api calls
//# sourceMappingURL=index.js.map