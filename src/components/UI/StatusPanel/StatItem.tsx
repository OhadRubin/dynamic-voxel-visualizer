import React from 'react';

interface StatItemProps {
  label: string;
  value: string | number;
}

const StatItem: React.FC<StatItemProps> = ({ label, value }) => {
  return (
    <div>
      <strong>{label}:</strong> {value}
    </div>
  );
};

export default StatItem;
