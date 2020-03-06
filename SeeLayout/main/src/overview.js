var Defs          = require('./defs.js')
var InfoViewer    = require('./utils/infoViewer.js')

const {remote, ipcRenderer} = require('electron');
const {MenuItem}   = remote;

var info = new InfoViewer.InfoViewer();

function OpenLayout(object)
{
  var args = {object: object};
  ipcRenderer.send('openExtraWindow', 'layout', object.info.label, JSON.stringify(args));
}

function Init(database)
{
  info.Init(document.getElementById('overviewCanvas'),document.getElementById('overviewFilter'));
  info.SetData(database.objects);

  //TEST for fast interation
  //if (database.objects.length > 0) OpenLayout(database.objects[0]);
  //END TEST

  //add events
  info.OnDoubleClickExternal     = OpenLayout;
  info.OnRowContextMenuOpenExternal = function(menu,object){
    menu.insert(0,new MenuItem({type: 'separator'}))
    menu.insert(0,new MenuItem({label: 'Open Layout', click() { OpenLayout(object); }}))
  }
}

function Destroy()
{
  console.log('Destroying environment...');
  ipcRenderer.send('closeExtraWindows');
  overviewGraph = undefined;
}

exports.Init = Init;
exports.Destroy = Destroy();

