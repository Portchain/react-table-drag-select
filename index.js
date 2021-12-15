import React from "react";
import clone from "clone";
import PropTypes from "prop-types";

export default class TableDragSelect extends React.Component {
  static propTypes = {
    value: props => {
      const error = new Error(
        "Invalid prop `value` supplied to `TableDragSelect`. Validation failed."
      );
      if (!Array.isArray(props.value)) {
        return error;
      }
      if (props.value.length === 0) {
        return;
      }
      const columnCount = props.value[0].length;
      for (const row of props.value) {
        if (!Array.isArray(row) || row.length !== columnCount) {
          return error;
        }
        for (const cell of row) {
          if (typeof cell !== "boolean") {
            return error;
          }
        }
      }
    },
    maxRows: PropTypes.number,
    maxColumns: PropTypes.number,
    granularityRows: PropTypes.number,
    granularityColumns: PropTypes.number,
    granularityRowsOffset: PropTypes.number,
    granularityColumnsOffset: PropTypes.number,
    granularityFollowsTarget: PropTypes.bool,
    onSelectionStart: PropTypes.func,
    onInput: PropTypes.func,
    onChange: PropTypes.func,
    children: props => {
      if (TableDragSelect.propTypes.value(props)) {
        return; // Let error be handled elsewhere
      }
      const error = new Error(
        "Invalid prop `children` supplied to `TableDragSelect`. Validation failed."
      );
      const trs = React.Children.toArray(props.children);
      const rowCount = props.value.length;
      const columnCount = props.value.length === 0 ? 0 : props.value[0].length;
      if (trs.length !== rowCount) {
        return error;
      }
      for (const tr of trs) {
        const tds = React.Children.toArray(tr.props.children);
        if (tr.type !== "tr" || tds.length !== columnCount) {
          return error;
        }
        for (const td of tds) {
          if (td.type !== "td") {
            return error;
          }
        }
      }
    }
  };

  static defaultProps = {
    value: [],
    // maximum number of rows to select at once
    maxRows: Infinity,
    // maximum number of columns to select at once
    maxColumns: Infinity,
    // how many rows to select at once
    granularityRows: 1,
    // how many columns to select at once
    granularityColumns: 1,
    // offset the row selection by N rows
    granularityRowsOffset: 0,
    // offset the column selection by N rows
    granularityColumnsOffset: 0,
    // if true, set the selection to the reverse of the target/clicked cell
    // if false, set the selection to the reverse of top/left cell of the selection
    granularityFollowsTarget: true,
    onSelectionStart: () => {},
    onInput: () => {},
    onChange: () => {}
  };

  state = {
    selectionStarted: false,
    hoverStarted: false,
    targetRow: null,
    targetColumn: null,
    startRow: null,
    startColumn: null,
    endRow: null,
    endColumn: null,
    addMode: null,
    hoverStartRow: null,
    hoverStartColumn: null,
    hoverEndRow: null,
    hoverEndColumn: null
  };

  componentDidMount = () => {
    window.addEventListener("mouseup", this.handleTouchEndWindow);
    window.addEventListener("touchend", this.handleTouchEndWindow);
  };

  componentWillUnmount = () => {
    window.removeEventListener("mouseup", this.handleTouchEndWindow);
    window.removeEventListener("touchend", this.handleTouchEndWindow);
  };

  render = () => {
    return (
      <table className="table-drag-select">
        <tbody>
          {this.renderRows()}
        </tbody>
      </table>
    );
  };

  renderRows = () =>
    React.Children.map(this.props.children, (tr, i) => {
      return (
        <tr key={i} {...tr.props}>
          {React.Children.map(tr.props.children, (cell, j) =>
            <Cell
              key={j}
              onTouchStart={this.handleTouchStartCell}
              onTouchMove={this.handleTouchMoveCell}
              onMouseEnter={this.onMouseEnter}
              onMouseLeave={this.onMouseLeave}
              selected={this.props.value[i][j]}
              hovered={this.isCellBeingHovered(i, j)}
              beingSelected={this.isCellBeingSelected(i, j)}
              {...cell.props}
            >
              {cell.props.children}
            </Cell>
          )}
        </tr>
      );
    });

  handleTouchStartCell = e => {
    const isLeftClick = e.button === 0;
    const isTouch = e.type !== "mousedown";
    if (!this.state.selectionStarted && (isLeftClick || isTouch)) {
      e.preventDefault();
      const { row: targetRow, column: targetColumn } = eventToCellLocation(e);
      const {
        startRow,
        endRow,
        startColumn,
        endColumn
      } = cellLocationByGranularity(eventToCellLocation(e), this.props);
      this.props.onSelectionStart({ startRow, startColumn });
      this.setState({
        selectionStarted: true,
        targetRow,
        targetColumn,
        startRow,
        startColumn,
        endRow,
        endColumn,
        addMode: this.props.granularityFollowsTarget
          ? !this.props.value[targetRow][targetColumn]
          : !this.props.value[startRow][startColumn]
      });
    }
  };

  handleTouchMoveCell = e => {
    if (this.state.selectionStarted) {
      e.preventDefault();
      const { endRow, endColumn } = cellLocationByGranularity(
        eventToCellLocation(e),
        this.props
      );
      const {
        startRow: stateStartRow,
        startColumn: stateStartColumn,
        endRow: stateEndRow,
        endColumn: stateEndColumn
      } = this.state;

      if (stateEndRow !== endRow || stateEndColumn !== endColumn) {
        const nextRowCount =
          stateStartRow === null && stateEndRow === null
            ? 0
            : Math.abs(endRow - stateStartRow) + 1;
        const nextColumnCount =
          stateStartColumn === null && stateEndColumn === null
            ? 0
            : Math.abs(endColumn - stateStartColumn) + 1;

        if (nextRowCount <= this.props.maxRows) {
          this.setState({ endRow });
        }

        if (nextColumnCount <= this.props.maxColumns) {
          this.setState({ endColumn });
        }
      }
    }
  };

  handleTouchEndWindow = e => {
    const isLeftClick = e.button === 0;
    const isTouch = e.type !== "mousedown";
    if (this.state.selectionStarted && (isLeftClick || isTouch)) {
      const value = clone(this.props.value);
      const minRow = Math.min(this.state.startRow, this.state.endRow);
      const maxRow = Math.max(this.state.startRow, this.state.endRow);
      for (let row = minRow; row <= maxRow; row++) {
        const minColumn = Math.min(
          this.state.startColumn,
          this.state.endColumn
        );
        const maxColumn = Math.max(
          this.state.startColumn,
          this.state.endColumn
        );
        for (let column = minColumn; column <= maxColumn; column++) {
          value[row][column] = this.state.addMode;
        }
      }
      this.setState({ selectionStarted: false });
      this.props.onChange(value);
    }
  };

  onMouseEnter = e => {
    if (!this.state.selectionStarted) {
      e.preventDefault();
      const { row, column } = eventToCellLocation(e);
      const {
        startRow,
        endRow,
        startColumn,
        endColumn
      } = cellLocationByGranularity({ row, column }, this.props);
      this.setState({
        hoverStarted: true,
        hoverStartRow: startRow,
        hoverEndRow: endRow,
        hoverStartColumn: startColumn,
        hoverEndColumn: endColumn
      });
      this.props.onChange(clone(this.props.value));
    }
  };

  onMouseLeave = e => {
    this.setState({
      hoverStarted: false,
      hoverStartRow: -1,
      hoverEndRow: -1,
      hoverStartColumn: -1,
      hoverEndColumn: -1
    });
    // this.setState({ hoverStarted})
  };

  isCellBeingSelected = (row, column) => {
    const minRow = Math.min(this.state.startRow, this.state.endRow);
    const maxRow = Math.max(this.state.startRow, this.state.endRow);
    const minColumn = Math.min(this.state.startColumn, this.state.endColumn);
    const maxColumn = Math.max(this.state.startColumn, this.state.endColumn);

    return (
      this.state.selectionStarted &&
      (row >= minRow &&
        row <= maxRow &&
        column >= minColumn &&
        column <= maxColumn)
    );
  };

  isCellBeingHovered = (row, column) => {
    const minRow = Math.min(this.state.hoverStartRow, this.state.hoverEndRow);
    const maxRow = Math.max(this.state.hoverStartRow, this.state.hoverEndRow);
    const minColumn = Math.min(
      this.state.hoverStartColumn,
      this.state.hoverEndColumn
    );
    const maxColumn = Math.max(
      this.state.hoverStartColumn,
      this.state.hoverEndColumn
    );

    return (
      this.state.hoverStarted &&
      (row >= minRow &&
        row <= maxRow &&
        column >= minColumn &&
        column <= maxColumn)
    );
  };
}

class Cell extends React.Component {
  // This optimization gave a 10% performance boost while drag-selecting
  // cells
  shouldComponentUpdate = nextProps =>
    this.props.beingSelected !== nextProps.beingSelected ||
    this.props.selected !== nextProps.selected ||
    this.props.hovered !== nextProps.hovered;

  componentDidMount = () => {
    // We need to call addEventListener ourselves so that we can pass
    // {passive: false}
    this.td.addEventListener("touchstart", this.handleTouchStart, {
      passive: false
    });
    this.td.addEventListener("touchmove", this.handleTouchMove, {
      passive: false
    });
  };

  componentWillUnmount = () => {
    this.td.removeEventListener("touchstart", this.handleTouchStart);
    this.td.removeEventListener("touchmove", this.handleTouchMove);
  };

  render = () => {
    let {
      className = "",
      disabled,
      beingSelected,
      selected,
      hovered,
      onTouchStart,
      onTouchMove,
      ...props
    } = this.props;
    if (disabled) {
      className += " cell-disabled";
    } else {
      className += " cell-enabled";
      if (selected) {
        className += " cell-selected";
      }
      if (beingSelected) {
        className += " cell-being-selected";
      }
      if (hovered) {
        className += " cell-hovered";
      }
    }
    return (
      <td
        ref={td => (this.td = td)}
        className={className}
        onMouseDown={this.handleTouchStart}
        onMouseMove={this.handleTouchMove}
        onMouseEnter={this.handleMouseEnter}
        onMouseLeave={this.handleMouseLeave}
        {...props}
      >
        {this.props.children || <span>&nbsp;</span>}
      </td>
    );
  };

  handleTouchStart = e => {
    if (!this.props.disabled) {
      this.props.onTouchStart(e);
    }
  };

  handleTouchMove = e => {
    if (!this.props.disabled) {
      this.props.onTouchMove(e);
    }
  };

  handleMouseEnter = e => {
    if (!this.props.disabled) {
      this.props.onMouseEnter(e);
    }
  };

  handleMouseLeave = e => {
    if (!this.props.disabled) {
      this.props.onMouseLeave(e);
    }
  };
}

// Takes a mouse or touch event and returns the corresponding row and cell.
// Example:
//
// eventToCellLocation(event);
// {row: 2, column: 3}
const eventToCellLocation = e => {
  let target;
  // For touchmove and touchend events, e.target and e.touches[n].target are
  // wrong, so we have to rely on elementFromPoint(). For mouse clicks, we have
  // to use e.target.
  if (e.touches) {
    const touch = e.touches[0];
    target = document.elementFromPoint(touch.clientX, touch.clientY);
  } else {
    target = e.target;
    while (target.tagName !== "TD") {
      target = target.parentNode;
    }
  }
  return {
    row: target.parentNode.rowIndex,
    column: target.cellIndex
  };
};

const numberByGranularity = (number, granularity, offset, max) => {
  let start = Number(number);
  let end = Number(number);
  if (granularity > 1) {
    start = Math.floor((number - offset) / granularity) * granularity + offset;
    end = start + granularity - 1;
    end = Math.min(end, max);
  }
  return { start, end };
};

const cellLocationByGranularity = (
  { row, column },
  {
    granularityRows = 1,
    granularityColumns = 1,
    granularityRowsOffset = 0,
    granularityColumnsOffset = 0,
    value = []
  }
) => {
  const maxRow = value.length ? value.length - 1 : 0;
  const maxColumn = value.length ? value[0].length - 1 : 0;
  let { start: startRow, end: endRow } = numberByGranularity(
    row,
    granularityRows,
    granularityRowsOffset,
    maxRow
  );
  let { start: startColumn, end: endColumn } = numberByGranularity(
    column,
    granularityColumns,
    granularityColumnsOffset,
    maxColumn
  );
  return {
    startRow: startRow,
    endRow,
    startColumn: startColumn,
    endColumn
  };
};
