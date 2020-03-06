var Common  = require('./common.js')
//var Defs    = require('../defs.js')
var Mural   = require('./mural.js')
var Palette = require('./palette.js')

//var layerSize = 30;
//var zoomFactor = 1.25;
//var textSpaceThreshold = 15;
var contentMargin = { top: 20, bottom: 20, left: 20, right: 20 };
var byteDimension = { width: 100, height: 50 };
//var textMargin = 10;

function Layout()
{
  var _this = this;

  this.mural = undefined;
  this.data  = undefined;
  this.scale = 0.0;

  this.GetNumColumns = function(){ return _this.data? _this.data.info.align : 8; }

  this.GridToOffset = function(gridPosition){ return gridPosition? gridPosition[1]*_this.GetNumColumns()+gridPosition[0] : undefined; }

  this.GetMinScale = function()
  {
    //TODO ~ ramonv ~ to be implemented
    return 1.0;
    //return (_this.mural.canvas.width-contentMargin.left-contentMargin.right)/_this.data.info.duration; }
  }

  this.SetScale = function(input)
  {
    var newScale = Math.max(_this.GetMinScale(),input);
    if (newScale != _this.scale)
    {
      _this.scale = newScale;

      var columns = _this.GetNumColumns();
      var rows    = Math.floor(_this.data.info.size / columns);

      _this.mural.SetInnerSizeX(columns*byteDimension.width*_this.scale+contentMargin.left+contentMargin.right);
      _this.mural.SetInnerSizeY(rows*byteDimension.height*_this.scale+contentMargin.top+contentMargin.bottom);
    }
    else
    {
      _this.mural.Refresh();
    }
  }

  this.PrepareData = function(data)
  {
    if (data.children)
    {
      for (var i=0,sz=data.children.length;i<sz;++i)
      {
        var child = data.children[i];
        child.parent = data;
        _this.PrepareData(child);
      }
    }
  }

  this.SetData = function(data)
  {
    _this.data = data;
    if (_this.data)  _this.PrepareData(_this.data);
    _this.SetScale(_this.GetMinScale());
  }

  this.RenderNode = function(renderOffset, memoffset, memsize, color, label)
  {
    var context = _this.mural.context;

    var columns = _this.GetNumColumns();

    var rowFirst = Math.floor(memoffset / columns);
    var colFirst = memoffset % columns;

    var memOffsetEnd = memoffset + (memsize-1);
    var rowLast = Math.floor(memOffsetEnd/columns);
    var colLast = memOffsetEnd % columns;

    context.lineWidth = 1;

    var startPosition = [renderOffset[0]+colFirst*byteDimension.width*_this.scale,renderOffset[1]+rowFirst*byteDimension.height*_this.scale];
    context.fillStyle = color;

    if ( rowLast == rowFirst )
    {
      //context.fillStyle = Palette.GetNodeColor(node.type);
      context.fillRect(startPosition[0],startPosition[1],memsize*byteDimension.width,byteDimension.height);
      context.strokeRect(startPosition[0],startPosition[1],memsize*byteDimension.width,byteDimension.height);
    }
    else if ( rowLast == (rowFirst+1) && colLast < colFirst)
    {
      //2 unconnected liner
      var firstLineGrids = columns - colFirst;
      context.fillRect(startPosition[0],startPosition[1],firstLineGrids*byteDimension.width,byteDimension.height);
      context.fillRect(renderOffset[0],startPosition[1]+byteDimension.height,(colLast+1)*byteDimension.width,byteDimension.height);

      //Draw custom outline to keep the edges without border to give continuity
      context.beginPath();
      context.moveTo(startPosition[0]+firstLineGrids*byteDimension.width,startPosition[1]);
      context.lineTo(startPosition[0],startPosition[1]);
      context.lineTo(startPosition[0],startPosition[1]+byteDimension.height);
      context.lineTo(startPosition[0]+firstLineGrids*byteDimension.width,startPosition[1]+byteDimension.height);
      context.moveTo(renderOffset[0],startPosition[1]+byteDimension.height);
      context.lineTo(renderOffset[0]+(colLast+1)*byteDimension.width,startPosition[1]+byteDimension.height);
      context.lineTo(renderOffset[0]+(colLast+1)*byteDimension.width,startPosition[1]+2*byteDimension.height);
      context.lineTo(renderOffset[0],startPosition[1]+2*byteDimension.height);
      context.stroke();
    }
    else
    {
      //block
      var shape = [];
      var shapePos = [colFirst,rowFirst];

      shape.push([shapePos[0],shapePos[1]])

      shapePos[1] += 1;                     shape.push([shapePos[0],shapePos[1]]);
      shapePos[0] -= colFirst;              shape.push([shapePos[0],shapePos[1]]);
      shapePos[1] += (rowLast - rowFirst);  shape.push([shapePos[0],shapePos[1]]);
      shapePos[0] += colLast+1;             shape.push([shapePos[0],shapePos[1]]);
      shapePos[1] -= 1;                     shape.push([shapePos[0],shapePos[1]]);
      shapePos[0] += ((columns-colLast)-1); shape.push([shapePos[0],shapePos[1]]);
      shapePos[1] -= (rowLast - rowFirst);  shape.push([shapePos[0],shapePos[1]]);

      context.beginPath();
      context.moveTo(startPosition[0],startPosition[1]);
      for (var i=1,sz=shape.length;i<sz;++i)
      {
        var newPosX = renderOffset[0]+shape[i][0]*byteDimension.width*_this.scale;
        var newPosY = renderOffset[1]+shape[i][1]*byteDimension.height*_this.scale;
        context.lineTo(newPosX,newPosY);
      }
      context.closePath();
      context.fill();

      //TODO ~ ramonv ~ when doing the outline remove the lateral bars for consistency

      context.stroke();
    }
  }

/*
  this.RenderNodeRecursive = function(node,offset,layer)
  {
    var nodePosition = [node.start*_this.scale+offset[0],layer*layerSize+offset[1]];
    var length = node.duration*_this.scale;

    if (nodePosition[0] > _this.mural.canvas.width || nodePosition[0]+length < 0){ return; } //clip out of canvas nodes

    var context = _this.mural.context;

    if (length <= 5)
    {
      //render outline
      context.moveTo(nodePosition[0], nodePosition[1]);
      context.lineTo(nodePosition[0], nodePosition[1]+layerSize*((node.maxDepth-layer)+1));
    }
    else
    {
      //outer body
      context.lineWidth = 1;
      context.fillStyle = Palette.GetNodeColor(node.type);
      context.fillRect(nodePosition[0],nodePosition[1],length,layerSize);

      //render outline
      context.strokeRect(nodePosition[0],nodePosition[1],length,layerSize);

      //clamp size to screen for text center
      var nodeRange = [Math.max(nodePosition[0],0),Math.min(_this.mural.canvas.width,nodePosition[0]+length)];
      var textRange = (nodeRange[1]-nodeRange[0]) - textMargin*2;
      if ( textRange > textSpaceThreshold)
      {
        var midPoint = (nodeRange[0]+nodeRange[1])*0.5;

        var label = Defs.NodeNatureToDisplayString(node.type);
        var labelSize = context.measureText(label).width;

        if (labelSize < textRange )
        {
          var label2 = node.label.length>0? ': '+ node.label : '';
          var labelSize2 = context.measureText(label2).width;

          if ((labelSize+labelSize2) < textRange)
          {
            label += label2;
            labelSize += labelSize2;

            var label3 = ' ('+Common.TimeToString(node.duration)+')';
            var labelSize3 = context.measureText(label3).width;
            if ((labelSize+labelSize3) < textRange){ label += label3; labelSize += labelSize3; }
          }
        }
        else
        {
          //SUPER SHORT VERSION
          label = Defs.NodeNatureToShortDisplayString(node.type);
          labelSize = context.measureText(label).width;
        }

        //render label
        context.fillStyle = Palette.Colors.nodeText;
        context.fillText(label,midPoint-labelSize*0.5,nodePosition[1]+(layerSize+Palette.Text.fontHeight)*0.5);
      }

      //recurse
      for (var i=0,sz=node.children.length;i<sz;++i) _this.RenderNodeRecursive(node.children[i],offset,layer+1);
    }
  }
*/
  this.RenderNodeRecursive = function(renderOffset,memOffset,node)
  {
    var thisMemOffset = node.offset? memOffset+node.offset : memOffset;
    _this.RenderNode(renderOffset,thisMemOffset,node.size,Palette.GetNodeColor(node.nature));

    if (node.expand && node.children)
    {
      for (var i=0,sz=node.children.length;i<sz;++i)
      {
        _this.RenderNodeRecursive(renderOffset,thisMemOffset,node.children[i]);
      }
    }
  }

  this.Render = function()
  {
    //Clear background
    _this.mural.context.fillStyle = Palette.Colors.background;
    _this.mural.context.fillRect(0,0,_this.mural.canvas.width,_this.mural.canvas.height);

    if (_this.data)
    {
      //TODO ~ ramon ~ render background

      var scrollOffset = _this.mural.GetScrollOffset();
      var offset = [scrollOffset[0]+contentMargin.left,scrollOffset[1]+contentMargin.top]

      for (var i=0,sz=_this.data.children.length;i<sz;++i)
      {
        _this.RenderNodeRecursive(offset,0,_this.data.children[i]);
      }
      /*
      var context = _this.mural.context;

      context.font = Palette.Text.font;
      context.strokeStyle = Palette.Colors.nodeOutline;
      context.beginPath();

      _this.RenderNodeRecursive(_this.data.root,offset,0);

      context.stroke();
      */
    }
    else
    {
      //TODO ~ ramonv ~ draw some nice empty letters in the middle of the canvas
    }
  }

  //this.OnResize = function(){ _this.SetScale(_this.scale); }

  this.Refresh = function(){ _this.mural.Render(); }
/*
  this.OnMouseWheel = function(e){
    if (e.ctrlKey)
    {
      var globalPosition = Common.GetCursorWindowPosition(e);
      var localPosition  = _this.mural.FromGlobalToLocal(globalPosition);
      var pivotPoint = localPosition[0]-_this.mural.GetScrollOffset()[0]-contentMargin.left;
      let prevScale = _this.scale;

      var factor = e.deltaY*0.01 > 0? 1.0/zoomFactor : zoomFactor;

      _this.SetScale(_this.scale*factor);

      let newScale = _this.scale;

      var scaleFactor = newScale/prevScale;

      _this.mural.MoveScrollXTo(pivotPoint*(newScale/prevScale)-localPosition[0]+contentMargin.left);

      //console.log(pivotPoint)

      //if (scrollMural == null && SetScroll(_this.scrollY, _this.scrollY.scroll + e.deltaY)){ _this.OnMouseMove(e); _this.Render(); }
    }
  }
*/

  this.FromScrollToGrid = function(position)
  {
    if ( _this.data == undefined ) return undefined;

    var columns = _this.GetNumColumns();

    var x = (position[0] - contentMargin.left) / (_this.scale*byteDimension.width);
    var y = (position[1] - contentMargin.top)  / (_this.scale*byteDimension.height);

    if ( x < 0 || x >=columns || y < 0 ) return undefined;

    return [Math.floor(x),Math.floor(y)];
  }

  this.FindViewedNode = function(node,memoffset,parentOffset = 0)
  {
    //TODO ~ ramonv ~ to be implemented

//TODO ~ ramonv ~ check for myself and return myself ig no childs or expand and whin offset range.

    if (( node.expand || node.parent == undefined )&& node.children)
    {
      for (var i=0,sz=node.children.length;i<sz;++i)
      {
        var child = node.children[i];
        var thisOffset = parentOffset + child.offset;
        if (memoffset >= thisOffset && memoffset < (thisOffset+child.size))
        {
          return FindViewedNode(); //TODO  ~raonv ~ finish this.
        }
      }
    }

    return undefined;
  }

  this.OnMouseMove = function(e)
  {
    var memoffset = _this.GridToOffset(_this.FromScrollToGrid(_this.mural.FromGlobalToScroll(Common.GetCursorWindowPosition(e))));

    //TODO ~ ramonv ~ to be implemented

    console.log(memoffset);

  }
  //TODO ~ ramonv ~ for mouse do the pass from position to grid and then check what we are hovering

  this.Init = function(canvas)
  {
    _this.mural = new Mural.Mural(canvas,_this.Render);
    _this.mural.Init();

    //_this.mural.OnMouseDownFunc = OnMouseDown;
    //_this.mural.OnMouseUpFunc   = OnMouseUp;
    _this.mural.OnMouseMoveFunc = _this.OnMouseMove;
    //_this.mural.OnMouseOutFunc  = OnMouseOut;
    //_this.mural.OnMouseWheelFunc = _this.OnMouseWheel;
    //_this.mural.OnResizeFunc     = _this.OnResize;

    _this.mural.canvas.setAttribute('tabindex','0'); //This allows in chrome to focus a canvas
    //_this.mural.canvas.addEventListener('keydown',OnCanvasKeyDown);
    //_this.mural.canvas.addEventListener('contextmenu', OnContextMenu);
  }
}

exports.Layout = Layout;
