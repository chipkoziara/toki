'use strict';

module.exports = {
  up: function up(queryInterface, Sequelize) {

    queryInterface.removeColumn('Users', 'defaultSnoozeTime');
    queryInterface.removeColumn('Users', 'defaultBreakTime');
    queryInterface.removeColumn('Users', 'includeOthersDecision');
    queryInterface.removeColumn('Users', 'pingTime');
    queryInterface.removeColumn('Users', 'wantsPing');

    queryInterface.addColumn('Users', 'SlackUserId', {
      type: Sequelize.STRING
    });

    queryInterface.addColumn('Users', 'tz', {
      type: Sequelize.STRING
    });

    queryInterface.addColumn('Users', 'TeamId', {
      type: Sequelize.STRING
    });

    queryInterface.addColumn('Users', 'scopes', {
      type: Sequelize.STRING
    });

    queryInterface.addColumn('Users', 'accessToken', {
      type: Sequelize.STRING
    });

    queryInterface.addColumn('Users', 'SlackName', {
      type: Sequelize.STRING
    });

    return queryInterface.removeColumn('Users', 'nickName');
  },

  down: function down(queryInterface, Sequelize) {}
};
//# sourceMappingURL=20160823144548-update-users-table.js.map