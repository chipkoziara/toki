'use strict';
module.exports = function(sequelize, DataTypes) {
  var SlackUser = sequelize.define('SlackUser', {
    UserId: DataTypes.INTEGER,
    SlackUserId: DataTypes.STRING,
    tz: DataTypes.STRING,
    TeamId: DataTypes.STRING,
    scopes: DataTypes.STRING,
    accessToken: DataTypes.STRING
  }, {
    classMethods: {
      associate: function(models) {
        SlackUser.belongsTo(models.User);
      }
    }
  });
  return SlackUser;
};