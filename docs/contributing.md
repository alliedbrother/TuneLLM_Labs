# Contributing to TuneLLM

Thank you for your interest in contributing to TuneLLM! This document provides guidelines and information for contributors.

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct. Please be respectful and inclusive in all interactions.

## How to Contribute

### Reporting Bugs

1. Check existing issues to avoid duplicates
2. Create a new issue with:
   - Clear title describing the bug
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (OS, GPU, versions)
   - Relevant logs or screenshots

### Suggesting Features

1. Check existing feature requests
2. Create a new issue with:
   - Clear description of the feature
   - Use case and motivation
   - Proposed implementation (optional)

### Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Write/update tests
5. Ensure all tests pass
6. Submit a pull request

## Development Setup

### Prerequisites

- Python 3.11+
- Node.js 20+
- Docker and Docker Compose
- NVIDIA GPU (optional, for training)

### Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install -r requirements-dev.txt  # Development dependencies

# Run tests
pytest

# Run linting
ruff check .
mypy app/
```

### Frontend Setup

```bash
cd frontend
npm install

# Run tests
npm test

# Run linting
npm run lint
```

### Running the Full Stack

```bash
cd docker
docker-compose up -d
```

## Project Structure

```
TuneLLM/
├── backend/           # FastAPI backend
│   ├── app/
│   │   ├── models/    # SQLAlchemy models
│   │   ├── schemas/   # Pydantic schemas
│   │   ├── routers/   # API endpoints
│   │   └── services/  # Business logic
│   └── tests/
├── frontend/          # React frontend
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── hooks/
│       └── services/
├── agent/             # Node agent
├── training/          # Training container
├── inference/         # Inference server
└── docs/              # Documentation
```

## Coding Standards

### Python

- Follow PEP 8 style guide
- Use type hints
- Write docstrings for public functions
- Maximum line length: 88 characters (Black default)

```python
def process_dataset(
    dataset_id: int,
    config: DatasetConfig,
) -> ProcessedDataset:
    """Process a dataset for training.

    Args:
        dataset_id: The ID of the dataset to process.
        config: Configuration for processing.

    Returns:
        The processed dataset ready for training.

    Raises:
        DatasetNotFoundError: If dataset doesn't exist.
    """
    ...
```

### TypeScript

- Use TypeScript strict mode
- Define interfaces for all data structures
- Use functional components with hooks
- Follow ESLint configuration

```typescript
interface JobCardProps {
  job: FineTuneJob;
  onCancel?: (id: number) => void;
}

export function JobCard({ job, onCancel }: JobCardProps) {
  // ...
}
```

## Testing

### Backend Tests

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=app --cov-report=html

# Run specific tests
pytest tests/test_auth.py -v
```

### Frontend Tests

```bash
# Run tests
npm test

# Run with coverage
npm test -- --coverage
```

## Git Workflow

### Branch Naming

- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation updates
- `refactor/` - Code refactoring
- `test/` - Test additions/updates

### Commit Messages

Follow conventional commits:

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation
- `style` - Formatting
- `refactor` - Code refactoring
- `test` - Tests
- `chore` - Maintenance

Example:
```
feat(training): add support for Mistral models

- Add Mistral-specific prompt template
- Update model loading for Mistral architecture
- Add tests for Mistral training

Closes #123
```

## Pull Request Process

1. Update documentation if needed
2. Add tests for new functionality
3. Ensure CI passes
4. Request review from maintainers
5. Address review feedback
6. Squash commits if requested

## Release Process

Releases follow semantic versioning (MAJOR.MINOR.PATCH):

- MAJOR: Breaking changes
- MINOR: New features (backwards compatible)
- PATCH: Bug fixes

## Getting Help

- Join our Discord community
- Check existing issues and discussions
- Ask questions in GitHub Discussions

## Recognition

Contributors will be recognized in:
- CONTRIBUTORS.md file
- Release notes
- Project documentation

Thank you for contributing to TuneLLM!
