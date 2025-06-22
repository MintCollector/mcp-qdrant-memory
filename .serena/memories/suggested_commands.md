# Development Commands

## Build and Development
- `npm run build` - Compiles TypeScript to JavaScript and makes output executable
- `npm run prepare` - Runs build (used by npm install)
- `npm run watch` - Watches TypeScript files for changes and rebuilds

## Testing
- `node test.mjs` - Direct test without authentication
- `node test-auth.mjs` - Test with authentication  
- `node test-direct.mjs` - Direct Qdrant client test
- `node test-meta-learning.mjs` - Comprehensive meta-learning functionality test

## System Commands (Darwin/macOS)
- `ls` - List directory contents
- `cd` - Change directory
- `grep` - Search text patterns in files
- `find` - Find files and directories
- `git` - Version control operations
- `npm` - Package management
- `node` - Run JavaScript/TypeScript
- `docker` - Container operations

## Package Management
- `npm install` - Install dependencies
- `npm update` - Update dependencies
- `npm audit` - Security audit

## Development Workflow
1. Make changes to TypeScript files in `src/`
2. Run `npm run build` to compile
3. Test with appropriate test script
4. Verify functionality works correctly