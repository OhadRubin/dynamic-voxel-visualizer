import React from 'react';

const voxelTypes = [
  { name: 'WALKABLE', color: '#00ff00' },
  { name: 'CURRENT_POSITION', color: '#0000ff' },
  { name: 'CURRENT_TARGET', color: '#ff00ff' },
  { name: 'PASSABLE', color: '#ffff00' },
  { name: 'WALL', color: '#ff0000' },
  { name: 'UNKNOWN', color: '#00ffff' }
];

const ColorLegend: React.FC = () => {
  const legendStyle: React.CSSProperties = {
    marginTop: '10px',
    fontSize: '12px'
  };

  const headerStyle: React.CSSProperties = {
    margin: '10px 0 5px 0',
    fontSize: '14px',
    fontWeight: 'normal'
  };

  const itemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    margin: '3px 0'
  };

  const colorBoxStyle: React.CSSProperties = {
    width: '16px',
    height: '16px',
    marginRight: '8px',
    border: '1px solid #666'
  };

  return (
    <div style={legendStyle} className="color-legend">
      <h4 style={headerStyle}>Voxel States:</h4>
      {voxelTypes.map((type, index) => (
        <div key={index} style={itemStyle} className="color-item">
          <div 
            style={{ 
              ...colorBoxStyle,
              backgroundColor: type.color
            }}
            className="color-box"
          />
          <span>{type.name}</span>
        </div>
      ))}
    </div>
  );
};

export default ColorLegend;
