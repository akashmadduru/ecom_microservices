# Java 22+ Migration Plan

## Issue: Lombok Compatibility

Lombok 1.18.x uses internal javac APIs that changed in Java 21+.

### Solutions

**Option 1: Use Lombok 1.18.33+ (Recommended)**
- Upgrade Lombok to latest 1.18.x version with Java 21+ support
- Keep existing Lombok annotations
- Minimal code changes

**Option 2: Remove Lombok (Alternative)**
- Keep manual getters/setters (already in Phase 0)
- Reduce build complexity
- No annotation processing overhead

**Option 3: Use Project Lombok-compatible alternatives**
- Consider Mapstruct for DTOs
- Use records (Java 14+) for immutable DTOs
- Native methods for entities

## Recommendation: Option 1 (Lombok 1.18.33+)

Latest versions of Lombok 1.18.x have patches for Java 21-22 compatibility.

## Migration Steps

1. Update `spring/pom.xml`:
   - Change `<maven.compiler.release>17</maven.compiler.release>` → `22`
   - Change `<lombok.version>1.18.32</lombok.version>` → `1.18.33+`
   - Remove `<maven.compiler.proc>none</maven.compiler.proc>`

2. Update Dockerfiles:
   - Change `FROM maven:3.9-eclipse-temurin-17` → `eclipse-temurin:22-jdk-alpine`
   - Change `FROM eclipse-temurin:17-jre-alpine` → `eclipse-temurin:22-jre-alpine`

3. Update `.java-version`:
   - Change `22` or higher

4. Update VS Code settings:
   - Update `java.configuration.runtimes` to point to Java 22

5. Verify Lombok annotations work:
   - Run `mvn clean compile`
   - Check that @Getter, @Setter, etc. are processed correctly

## Benefits of Java 22+

✅ Virtual threads (Virtual Threads in preview since Java 19, finalized)
✅ Pattern matching improvements
✅ Foreign Function & Memory API
✅ Improved performance
✅ Better garbage collection
✅ Latest security patches

## Risks

⚠️ Some third-party dependencies may not support Java 22
⚠️ Lombok compatibility issues (mitigated with 1.18.33+)
⚠️ Docker image size might be slightly larger

## Verification Commands

```bash
# Check Java version
java -version

# Build with Java 22
mvn clean compile

# Run tests
mvn test

# Docker build
docker-compose build auth-service
```

## Rollback Plan

If issues arise:
```bash
# Revert to Java 17
git checkout spring/pom.xml .java-version
# Reinstall Java 17
/opt/homebrew/opt/openjdk@17/...
```
