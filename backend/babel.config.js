export default {
    presets: [
        ['@babel/preset-env', { targets: { node: 'current' }, modules: false }],
        '@babel/preset-react'
    ],
    plugins: [
        '@babel/plugin-syntax-jsx'
    ]
};
