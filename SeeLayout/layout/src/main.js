var Layout = require('../../main/src/utils/layout.js')

const {ipcRenderer} = require('electron');

//init
var layout = new Layout.Layout();
layout.Init(document.getElementById('layout'));

//listen for data
ipcRenderer.on('args' , function(event , data)
{
  var data = JSON.parse(data);
  if (layout.data == undefined && data.object)
  {
    document.title = 'Layout: ' + data.object.info.label;
    layout.SetData(data.object);
  }
});

//This input needs to come from outside in order to support multiple tabs
document.addEventListener('keydown', function(e){ if (e.ctrlKey && e.shiftKey && e.keyCode == 73) ipcRenderer.send('toggle-devtools'); }, true);
