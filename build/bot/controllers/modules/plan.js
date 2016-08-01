'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});
exports.startNewPlanFlow = startNewPlanFlow;

var _os = require('os');

var _os2 = _interopRequireDefault(_os);

var _index = require('../index');

var _http = require('http');

var _http2 = _interopRequireDefault(_http);

var _bodyParser = require('body-parser');

var _bodyParser2 = _interopRequireDefault(_bodyParser);

var _momentTimezone = require('moment-timezone');

var _momentTimezone2 = _interopRequireDefault(_momentTimezone);

var _models = require('../../../app/models');

var _models2 = _interopRequireDefault(_models);

var _botResponses = require('../../lib/botResponses');

var _messageHelpers = require('../../lib/messageHelpers');

var _constants = require('../../lib/constants');

var _miscHelpers = require('../../lib/miscHelpers');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 * 		NEW PLAN CONVERSATION FLOW FUNCTIONS
 */

function startNewPlanFlow(convo) {
	var bot = convo.task.bot;
	var _convo$newPlan = convo.newPlan;
	var daySplit = _convo$newPlan.daySplit;
	var autoWizard = _convo$newPlan.autoWizard;
	var prioritizedTasks = convo.newPlan.prioritizedTasks;


	var contextDay = "today";
	if (daySplit != _constants.constants.MORNING.word) {
		contextDay = 'this ' + daySplit;
	}
	var question = 'What are the 3 outcomes you want to make happen today?';
	if (autoWizard) {
		question = question + ' Please enter each one in a separate message';
	}

	prioritizedTasks = [];
	var options = { dontShowMinutes: true, dontCalculateMinutes: true };
	var taskListMessage = void 0;
	convo.ask({
		text: question,
		attachments: (0, _messageHelpers.getNewPlanAttachments)(prioritizedTasks)
	}, [{
		pattern: _botResponses.utterances.startsWithHelp,
		callback: function callback(response, convo) {

			convo.newPlan.prioritizedTasks = [];

			convo.say("Okay, let's do do this together!");
			wizardPrioritizeTasks(convo);
			convo.next();
		}
	}, {
		pattern: _constants.buttonValues.redoTasks.value,
		callback: function callback(response, convo) {

			prioritizedTasks = [];
			convo.newPlan.prioritizedTasks = prioritizedTasks;

			convo.say("Okay, let's try this again :repeat:");
			startNewPlanFlow(convo);
			convo.next();
		}
	}, {
		pattern: _botResponses.utterances.done,
		callback: function callback(response, convo) {

			convo.newPlan.prioritizedTasks = prioritizedTasks;

			convo.say("Excellent!");

			if (autoWizard) {
				prioritizeTasks(convo);
			} else {
				prioritizeTasks(convo);
			}

			convo.next();
		}
	}, { // this is additional task added in this case.
		default: true,
		callback: function callback(response, convo) {

			var updateTaskListMessageObject = (0, _messageHelpers.getMostRecentTaskListMessageToUpdate)(response.channel, bot);

			var newTaskArray = (0, _messageHelpers.convertResponseObjectToNewTaskArray)(response);
			newTaskArray.forEach(function (newTask) {
				prioritizedTasks.push(newTask);
			});

			taskListMessage = (0, _messageHelpers.convertArrayToTaskListMessage)(prioritizedTasks, options);

			updateTaskListMessageObject.text = question + '\n' + taskListMessage;

			var attachments = (0, _messageHelpers.getNewPlanAttachments)(prioritizedTasks);

			if (prioritizedTasks.length < 3) {
				updateTaskListMessageObject.attachments = JSON.stringify(attachments);
				bot.api.chat.update(updateTaskListMessageObject);
			} else {

				while (prioritizedTasks.length > 3) {
					// only 3 priorities!
					prioritizedTasks.pop();
				}

				// we move on, with default to undo.
				updateTaskListMessageObject.attachments = JSON.stringify(_constants.taskListMessageNoButtonsAttachment);
				bot.api.chat.update(updateTaskListMessageObject);

				convo.newPlan.prioritizedTasks = prioritizedTasks;

				convo.say("Excellent!");

				if (autoWizard) {
					prioritizeTasks(convo);
				} else {
					prioritizeTasks(convo);
				}

				convo.next();
			}
		}
	}]);
}

function wizardPrioritizeTasks(convo) {

	convo.ask('What is your one result from today, that alone would make you feel most accomplished?', function (response, convo) {
		convo.say("Awesome!");
		convo.next();
	});
}

function prioritizeTasks(convo) {
	var question = arguments.length <= 1 || arguments[1] === undefined ? '' : arguments[1];
	var bot = convo.task.bot;
	var _convo$newPlan2 = convo.newPlan;
	var daySplit = _convo$newPlan2.daySplit;
	var autoWizard = _convo$newPlan2.autoWizard;
	var prioritizedTasks = convo.newPlan.prioritizedTasks;


	if (question == '') // this is the default question!
		question = 'How would you rank your ' + prioritizedTasks.length + ' priorities in order of most meaningful to your day?';

	if (prioritizedTasks.length == 1) {
		// 1 task needs no prioritizing
		convo.newPlan.startTask.index = 0;
		getTimeToTask(convo);
	} else {
		// 2+ tasks need prioritizing
		var options = { dontShowMinutes: true, dontCalculateMinutes: true };
		var taskListMessage = (0, _messageHelpers.convertArrayToTaskListMessage)(prioritizedTasks, options);

		convo.ask({
			text: question + '\n' + taskListMessage,
			attachments: [{
				attachment_type: 'default',
				callback_id: "KEEP_TASK_ORDER",
				fallback: "Let's keep this task order!",
				color: _constants.colorsHash.grey.hex,
				actions: [{
					name: _constants.buttonValues.keepTaskOrder.name,
					text: "Keep this order!",
					value: _constants.buttonValues.keepTaskOrder.value,
					type: "button"
				}]
			}]
		}, [{
			pattern: _botResponses.utterances.startsWithKeep,
			callback: function callback(response, convo) {

				convo.say("This order looks great to me, too!");
				convo.next();
			}
		}, {
			default: true,
			callback: function callback(response, convo) {

				var taskNumbersToWorkOnArray = (0, _messageHelpers.convertTaskNumberStringToArray)(response.text, prioritizedTasks);

				var necessaryNumbers = [];
				for (var i = 0; i < prioritizedTasks.length; i++) {
					var number = i + 1;
					necessaryNumbers.push(number);
				}

				var newPrioritizedTaskNumbers = taskNumbersToWorkOnArray.slice();
				// this tests if the arrays contain the same values or not
				if (taskNumbersToWorkOnArray.sort().join(',') === necessaryNumbers.sort().join(',')) {
					(function () {

						var newPrioritizedTasks = [];
						newPrioritizedTaskNumbers.forEach(function (taskNumber) {
							var index = taskNumber - 1;
							newPrioritizedTasks.push(prioritizedTasks[index]);
						});
						convo.newPlan.prioritizedTasks = newPrioritizedTasks;

						convo.say("Love it!");
					})();
				} else {

					necessaryNumbers.reverse();
					var numberString = necessaryNumbers.join(", ");
					convo.say("Sorry, I didn't catch that");
					var repeatQuestion = 'Let me know how you would rank your ' + prioritizedTasks.length + ' priorities in order of importance by listing the numbers `i.e. ' + numberString + '`';
					prioritizeTasks(convo, repeatQuestion);
				}

				convo.next();
			}
		}]);
	}
}

/*
function prioritizeTasks(convo, question = '') {

	const { task: { bot }, newPlan: { daySplit, autoWizard } } = convo;
	let { newPlan: { prioritizedTasks } } = convo;

	if (question == '') // this is the default question!
		question = `Out of your ${prioritizedTasks.length} priorities, which one would most make the rest of your day easier, or your other tasks more irrelevant?`;

	if (prioritizedTasks.length == 1) {
		// 1 task needs no prioritizing
		convo.newPlan.startTask.index = 0;
		getTimeToTask(convo);
	} else {
		// 2+ tasks need prioritizing

		let options         = { dontShowMinutes: true, dontCalculateMinutes: true };
		let taskListMessage = convertArrayToTaskListMessage(prioritizedTasks, options);

		convo.ask({
			text: `${question}\n${taskListMessage}`,
			attachments: [
				{
					attachment_type: 'default',
					callback_id: "REDO_TASKS",
					fallback: "Do you want to work on this task?",
					color: colorsHash.grey.hex,
					actions: [
						{
								name: buttonValues.redoMyPriorities.name,
								text: "Redo my priorities!",
								value: buttonValues.redoMyPriorities.value,
								type: "button"
						}
					]
				}
			]
		}, [
			{
				pattern: utterances.containsRedo,
				callback: (response, convo) => {

					convo.say("Okay, let's try this again :repeat:");
					startNewPlanFlow(convo);
					convo.next();

				}
			},
			{
				pattern: utterances.containsNumber,
				callback: (response, convo) => {

					let taskNumbersToWorkOnArray = convertTaskNumberStringToArray(response.text, prioritizedTasks);
					let taskIndexToWorkOn        = taskNumbersToWorkOnArray[0] - 1;

					if (taskIndexToWorkOn >= 0) {
						convo.newPlan.startTask.index = taskIndexToWorkOn;
						getTimeToTask(convo);
					} else {
						convo.say("Sorry, I didn't catch that. Let me know a number `i.e. task 2`");
						convo.repeat();
					}

					convo.next();
				}
			},
			{
				default: true,
				callback: (response, convo) => {
					convo.say("Sorry, I didn't catch that. Let me know a number `i.e. task 2`");
					convo.repeat();
					convo.next();
				}
			}
		]);
	}

}
*/

function getTimeToTask(convo) {
	var _convo$newPlan3 = convo.newPlan;
	var tz = _convo$newPlan3.tz;
	var daySplit = _convo$newPlan3.daySplit;
	var autoWizard = _convo$newPlan3.autoWizard;
	var startTask = _convo$newPlan3.startTask;
	var prioritizedTasks = convo.newPlan.prioritizedTasks;


	var taskString = prioritizedTasks[startTask.index].text;

	var attachments = [];
	if (prioritizedTasks.length > 1) {
		attachments.push({
			attachment_type: 'default',
			callback_id: "CHANGE_TASK",
			fallback: "Do you want to work on a different task?",
			color: _constants.colorsHash.grey.hex,
			actions: [{
				name: _constants.buttonValues.workOnDifferentTask.name,
				text: "Different task instead",
				value: _constants.buttonValues.workOnDifferentTask.value,
				type: "button"
			}]
		});
	}

	convo.say({
		text: 'Great! Let\'s make time to do `' + taskString + '` then :punch:',
		attachments: attachments
	});

	convo.ask({
		text: 'How much time do you want to put towards this priority?'
	}, [{
		pattern: _botResponses.utterances.containsDifferent,
		callback: function callback(response, convo) {

			convo.say("Okay, let's do a different task!");

			var question = "What task do you want to start with instead?";
			wizardPrioritizeTasks(convo, question);
			convo.next();
		}
	}, {
		default: true,
		callback: function callback(response, convo) {

			// use wit to decipher the relative time. if no time, then re-ask
			var _response$intentObjec = response.intentObject.entities;
			var duration = _response$intentObjec.duration;
			var datetime = _response$intentObjec.datetime;

			var customTimeObject = (0, _miscHelpers.witTimeResponseToTimeZoneObject)(response, tz);

			var minutes = 0;
			var now = (0, _momentTimezone2.default)();

			if (duration) {
				minutes = (0, _miscHelpers.witDurationToMinutes)(duration);
			} else {
				minutes = (0, _messageHelpers.convertTimeStringToMinutes)(response.text);
			}

			if (minutes > 0) {
				convo.say('Got it!');
				convo.newPlan.startTask.minutes = minutes;
				startOnTask(convo);
			} else {
				convo.say("Sorry, I didn't catch that. Let me know a time `i.e. 45 minutes`");
				convo.repeat();
			}

			convo.next();
		}
	}]);
}

function startOnTask(convo) {
	var _convo$newPlan4 = convo.newPlan;
	var tz = _convo$newPlan4.tz;
	var daySplit = _convo$newPlan4.daySplit;
	var autoWizard = _convo$newPlan4.autoWizard;
	var startTask = _convo$newPlan4.startTask;
	var prioritizedTasks = convo.newPlan.prioritizedTasks;


	var timeExample = (0, _momentTimezone2.default)().tz(tz).add(15, "minutes").format("h:mma");
	convo.ask({
		text: 'When would you like to start? You can tell me a specific time, like `' + timeExample + '`, or a relative time, like `in 15 minutes`',
		attachments: [{
			attachment_type: 'default',
			callback_id: "DO_TASK_NOW",
			fallback: "Let's do it now!",
			color: _constants.colorsHash.grey.hex,
			actions: [{
				name: _constants.buttonValues.workOnTaskNow.name,
				text: "Let's do it now!",
				value: _constants.buttonValues.workOnTaskNow.value,
				type: "button"
			}]
		}] }, [{
		pattern: _botResponses.utterances.containsNow,
		callback: function callback(response, convo) {

			convo.say("Okay, let's do this now :muscle:");
			convo.next();
		}
	}, {
		default: true,
		callback: function callback(response, convo) {

			// use wit to decipher the relative time. if no time, then re-ask
			var _response$intentObjec2 = response.intentObject.entities;
			var duration = _response$intentObjec2.duration;
			var datetime = _response$intentObjec2.datetime;

			var customTimeObject = (0, _miscHelpers.witTimeResponseToTimeZoneObject)(response, tz);

			var minutes = void 0;
			var now = (0, _momentTimezone2.default)();
			if (customTimeObject) {
				convo.newPlan.startTime = customTimeObject;
				if (duration) {
					minutes = (0, _miscHelpers.witDurationToMinutes)(duration);
				} else {
					minutes = parseInt(_momentTimezone2.default.duration(customTimeObject.diff(now)).asMinutes());
				}
				var timeString = customTimeObject.format("h:mm a");
				convo.say('Okay! I\'ll ping you in ' + minutes + ' minutes at ' + timeString + ' :wave:');
				convo.next();
			} else {
				convo.say("Sorry, I didn't catch that. Let me know a time `i.e. let's start in 10 minutes`");
				convo.repeat();
			}

			convo.next();
		}
	}]);
}
//# sourceMappingURL=plan.js.map