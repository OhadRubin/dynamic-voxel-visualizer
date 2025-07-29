import React from 'react';

const voxelTypes = [
  { name: 'Type 1', color: '#ff0000' },
  { name: 'Type 2', color: '#00ff00' },
  { name: 'Type 3', color: '#0000ff' },
  // TODO: Add more voxel types as needed
];

const ColorLegend: React.FC = () => {
  return (
    <div>
      <h4>Voxel Types</h4>
      {voxelTypes.map((type, index) => (
        <div key={index} style={{ display: 'flex', alignItems: 'center' }}>
          <div 
            style={{ 
              width: '16px', 
              height: '16px', 
              backgroundColor: type.color,
              marginRight: '8px'
            }}
          />
          <span>{type.name}</span>
        </div>
      ))}
    </div>
  );
};

export default ColorLegend;
