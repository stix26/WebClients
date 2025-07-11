class WebpackCollectMetricsPlugin {
    constructor(buildData) {
        this.buildData = buildData;
    }

    apply(compiler) {
        compiler.hooks.done.tap('WebpackCollectMetricsPlugin', (stats) => {
            // Basic metrics collection - can be enhanced as needed
            const compilation = stats.compilation;
            const metrics = {
                buildTime: stats.endTime - stats.startTime,
                errors: compilation.errors.length,
                warnings: compilation.warnings.length,
                assets: Object.keys(compilation.assets).length,
                chunks: compilation.chunks.size,
                modules: compilation.modules.size,
                buildData: this.buildData
            };

            // In a real implementation, this would send metrics to a collection service
            // For now, just log to console in CI environments
            if (process.env.CI) {
                console.log('Build metrics:', JSON.stringify(metrics, null, 2));
            }
        });
    }
}

module.exports = {
    WebpackCollectMetricsPlugin
};