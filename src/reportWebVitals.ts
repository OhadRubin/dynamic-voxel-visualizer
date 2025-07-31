import { ReportHandler } from 'web-vitals';

const reportWebVitals = (onPerfEntry?: ReportHandler) => {
  // Add a console.log to see the performance entries
  const logPerfEntry = (entry: any) => {
    console.log('Performance Entry:', entry);
    if (onPerfEntry) {
      onPerfEntry(entry);
    }
  };

  if (logPerfEntry && logPerfEntry instanceof Function) {
    import('web-vitals').then(({ getCLS, getFID, getFCP, getLCP, getTTFB }) => {
      getCLS(logPerfEntry);
      getFID(logPerfEntry);
      getFCP(logPerfEntry);
      getLCP(logPerfEntry);
      getTTFB(logPerfEntry);
    });
  }
};

export default reportWebVitals;
