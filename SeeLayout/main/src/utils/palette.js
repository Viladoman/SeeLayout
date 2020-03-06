var Defs = require('../defs.js')

exports.Colors = {
  background:          '#333333',
  backgroundSelected:  '#535353',
  background2:         '#191919',
  background2Selected: '#393939',
  nodeText:            '#ffffff',
  nodeOutline:         '#000000',
  infoText:            '#ffffff',
}

exports.Text = {
  font:       '10px Verdana',
  fontHeight: 10,
}

exports.GetNodeColor = function(nature)
{
  switch(nature)
  {
    case Defs.NodeNature.SIMPLE:
      return '#550055';

    case Defs.NodeNature.BITFIELD:
      return '#000077';

    case Defs.NodeNature.COMPLEX:
      return '#aa7300';

    case Defs.NodeNature.VPRIMARYBASE:
    case Defs.NodeNature.VBASE:
      return '#aa7333';

    case Defs.NodeNature.NVPRIMARYBASE:
    case Defs.NodeNature.NVBASE:
      return '#007700';

    case Defs.NodeNature.VTABLEPTR:
    case Defs.NodeNature.VFTABLEPTR:
    case Defs.NodeNature.VBTABLEPTR:
    case Defs.NodeNature.VTORDISP:
      return '#007733';

    case Defs.NodeNature.ROOT:
    default: return '#333333';
  }
}
