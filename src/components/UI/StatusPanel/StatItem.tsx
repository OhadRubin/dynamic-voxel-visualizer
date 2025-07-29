import React from 'react';

interface StatItemProps {
  label: string;
  value: string | number | React.ReactNode;
  className?: string;
}

const StatItem: React.FC<StatItemProps> = ({ label, value, className = '' }) => {
  const style: React.CSSProperties = {
    margin: '5px 0',
    display: 'flex',
    justifyContent: 'space-between'
  };

  return (
    <div style={style} className={`stat-item ${className}`}>
      <span>{label}:</span>
      <span>{value}</span>
    </div>
  );
};

export default StatItem;
