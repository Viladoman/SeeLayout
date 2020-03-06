var Defs   = require('./defs.js')
var FileIO = require('./fileIO.js')
/*
var path = require('path');

//visualizer works with a vector of obj.name obj.stats

//Stat entry count, accum, avg

function FillGlobalData(element,globals)
{
  if (element.type < Defs.NodeNatureData.GLOBAL_GATHER_THRESHOLD)
  {
    var globalCollection = globals[element.type];

    var found = globalCollection[element.label];
    if (found == undefined)
    {
      globalCollection[element.label] = {min: element.duration, max: element.duration, acc: element.duration, num: 1};
    }
    else
    {
      var targetElement = found;
      targetElement.min = Math.min(targetElement.min, element.duration);
      targetElement.max = Math.max(targetElement.max, element.duration);
      targetElement.acc += element.duration;
      ++targetElement.num;
    }
  }
}

function CreateObjectData(file,events,globals)
{
  var nodes = [];
  var objectDB = { info: { label: path.basename(file).replace(/\.[^/.]+$/, "")}};

  //replace this foreach
  for (var i=0,sz=events.length;i<sz;++i)
  {
    var element = events[i];
    if (element.tid == 0 && element.name != 'process_name')
    {
      var node = {label: element.args.detail, type: Defs.NodeNatureFromString(element.name), start: element.ts, duration: element.dur, maxDepth: 0, children: []};
      if (node.type == Defs.NodeNature.SOURCE){ node.label = path.basename(node.label); }
      if (node.type == Defs.NodeNature.EXECUTECOMPILER){ node.label = objectDB.info.label; }
      nodes.push(node);
      FillGlobalData(node,globals);
    }
  }

  if (nodes.length > 0)
  {
    nodes.sort(function(a,b){ return a.start == b.start? b.duration - a.duration : a.start - b.start; });

    var root = nodes[0];
    var layers = [{node: root, end: root.start + root.duration }];
    var totals = Array(Defs.NodeNatureData.COUNT).fill(0);

    for (var i=1,sz=nodes.length;i<sz;++i)
    {
      var element = nodes[i];
      var currentLayer = layers.length;
      if (element.start >= layers[currentLayer-1].end)
      {
        //pop all layers that are past the current timeline
        do { layers.pop() }
        while(element.start >= layers[layers.length-1].end);
      }

      //Add Child and check if same time
      var parentNode = layers[layers.length-1].node;

      //propagate maxLayer
      var currentLayer = layers.length;
      var k=currentLayer-1;
      while(k>=0){
        var pNode = layers[k].node;
        if (pNode.maxDepth >= currentLayer) break;
        pNode.maxDepth = currentLayer;
        --k;
      }

      element.maxDepth = currentLayer;
      parentNode.children.push(element);

      //change of type ( no overlap, just add to totals
      if (parentNode.type != element.type){ totals[element.type] += element.duration; }

      layers.push( {node: element, end: element.start + element.duration } );
    }

    objectDB.root = root;

    var objInfo = objectDB.info;
    objInfo.duration = root.duration;

    for (var i=0;i<Defs.NodeNatureData.GLOBAL_DISPLAY_THRESHOLD;i++) objInfo[Defs.NodeNatureToKey(i)] = totals[i];
  }

  return objectDB;
}

function FinalizeGlobalData(source, target)
{
  for(var i=0;i<source.length;++i)
  {
    var container = source[i];
    var targetContainer = target[i];
    for (var key in container)
    {
      var entry = container[key];
      targetContainer.push({info:{ label: key, acc: entry.acc, min: entry.min, max: entry.max, num: entry.num, avg: Math.round((entry.acc*100)/entry.num)/100 }})
    }
  }
}
*/

function renameProperty(object, oldName, newName) {
 // Check for the old property name to avoid a ReferenceError in strict mode.
 if (object.hasOwnProperty(oldName)) { object[newName] = object[oldName];  delete object[oldName]; }
};

function FlatObjectMap(objectMap)
{
  var ret = [];
  for ( var key in objectMap )
  {
    ret.push(objectMap[key]);
  }
  return ret;
}

function UpdateData(item)
{
  renameProperty(item,"l","name");
  renameProperty(item,"t","type");
  renameProperty(item,"o","offset");
  renameProperty(item,"s","size");
  renameProperty(item,"a","align");
  renameProperty(item,"n","nature");
  renameProperty(item,"c","children");

  if ( item.children )
  {
    for (var i=0,sz=item.children.length;i<sz;++i)
    {
      UpdateData(item.children[i]);
    }
  }
}

function GetRealSize(item)
{
  var realSize = 0;
  if (item.children)
  {
    for ( var i=0,sz=item.children.length;i<sz;++i)
    {
      var child = item.children[i];
      switch(child.nature)
      {
        case Defs.NodeNature.COMPLEX:
        case Defs.NodeNature.NVPRIMARYBASE:
        case Defs.NodeNature.VPRIMARYBASE:
        case Defs.NodeNature.NVBASE:
        case Defs.NodeNature.VBASE:
          realSize += GetRealSize(child);
          break;

        default:
          realSize += child.size;
      }
    }
  }
  return realSize;
}

function AddItemToDatabase(objectMap, item)
{
  var typename = item.t;
  if (typename && objectMap[typename] == undefined)
  {
    UpdateData(item);

    var realSize = GetRealSize(item);
    var paddingSize = item.size-realSize;
    var paddingRatio = paddingSize/item.size;

    var info = { label: item.type, size: item.size, align: item.align, real: realSize, pad: paddingSize, padPCT: paddingRatio*100 };

    //TODO ~ compute padding percents and other stuff



    objectMap[typename] = { info: info, children: item.children, };
  }
}

function Collect(paths, doneCallback)
{
  var database = {};
  var objectMap = {};

  FileIO.ParsePaths(paths,
    function(file,content)
    {
      var structs = JSON.parse(content);
      for (var i=0,sz=structs.length;i<sz;++i)
      {
        AddItemToDatabase(objectMap, structs[i]);
      }
    },
    //done callback
    function(error)
    {
      if (error)
      {
        console.log(error);
        doneCallback({error: error});
      }
      else
      {
        if (OnFinalizingCallback) OnFinalizingCallback();
        database.objects = FlatObjectMap(objectMap);
        doneCallback(database);
      }
    }
  );
}



//GlobalStats ( time on each mode )
//List Filename-BasicStats-Graphs ( ObjectData )

exports.Load = Collect;

exports.SetOnFolderScan  = function(func) { FileIO.SetOnFolderScan(func); }
exports.SetOnFileFound   = function(func) { FileIO.SetOnFileFound(func); }
exports.SetOnFileParsing = function(func) { FileIO.SetOnFileParsing(func); }
exports.SetOnFileDone    = function(func) { FileIO.SetOnFileDone(func); }
exports.SetOnFinalizing  = function(func) { OnFinalizingCallback = func; }

