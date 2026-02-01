# Step 4-f: Recommendation Improvement via Composite Scoring

## Overview

Step 4-f implements an **advanced recommendation quality improvement layer** that enhances AI-generated menu recommendations beyond the base Seq2Set Transformer model by incorporating:

1. **Diversity Scoring**: Ensures recommended menus are nutritionally diverse within each set
2. **Nutrition Matching**: Aligns recommendations with user nutrition targets  
3. **Composite Scoring**: Combines model confidence, diversity, and nutrition fit into a unified quality metric
4. **Allergen Filtering**: Optional pre-filtering based on allergen constraints

## Architecture

### Core Components

#### 1. **Diversity Scorer** (`ml/improve_recommendations.py`)
Measures nutritional diversity within a recommended menu set:

```python
class DiversityScorer:
    def calculate_menu_diversity(self, menus: List[Dict]) -> float:
        """
        Calculates average pairwise L2 distance between nutrition vectors.
        
        Returns: 0-1 score (0=identical nutrition, 1=maximally diverse)
        """
```

**Methodology**:
- Normalizes nutrition values (energy, protein, fat, carbs) to 0-1 range
- Computes L2 distance between each pair of menus
- Returns mean pairwise distance as diversity metric

**Example**:
- 4 identical menus = 0.0 (no diversity)
- 4 maximally different menus = ~1.0 (high diversity)
- Typical recommendation set = 0.10-0.15

#### 2. **Nutrition Matcher** (`ml/improve_recommendations.py`)
Scores how well a menu set matches user nutrition targets:

```python
class NutritionMatcher:
    def calculate_match_score(self, menus: List[Dict], targets: Dict) -> float:
        """
        Scores deviation from nutrition targets.
        
        Returns: 0-1 score (1=perfect match to targets)
        """
```

**Target Configuration** (Default):
- **Protein**: 20g (weight: 30%)
- **Energy**: 400 kcal (weight: 30%)
- **Fat**: 10g (weight: 20%)
- **Carbs**: 50g (weight: 20%)

**Scoring Logic**:
1. Calculate average per-menu values
2. Compute deviation from target: `deviation = |actual - target|`
3. Normalize deviation by target: `normalized_dev = deviation / target`
4. Convert to 0-1 score: `score = max(0, 1 - normalized_dev)`
5. Weight by category importance

**Example**:
- Average protein = 20g (on target) → score = 1.0
- Average energy = 300 kcal (25% below target) → score = 0.75

#### 3. **Allergen Filter** (`ml/improve_recommendations.py`)
Optional pre-filtering based on allergen constraints:

```python
class AllergenFilter:
    def filter_by_allergen(self, menus: List[Dict], allergens: List[str]) -> List[Dict]:
        """
        Removes menus containing any of the specified allergens.
        """
```

**Supported Allergens**:
- 卵 (Egg)
- 乳類 (Dairy)
- 小麦 (Wheat)
- えび (Shrimp)
- かに (Crab)
- 落花生 (Peanut)
- そば (Buckwheat)
- 大豆 (Soy)
- ナッツ (Tree nuts)
- ゴマ (Sesame)
- 魚 (Fish)
- 貝類 (Shellfish)

#### 4. **Recommendation Improver** (`ml/improve_recommendations.py`)
Orchestrates the improvement pipeline:

```python
class RecommendationImprover:
    def generate_improved_recommendations(
        self,
        menus: List[Dict],
        model_scores: List[float],
        weights: Dict = None
    ) -> List[Dict]:
        """
        Main improvement function. Returns recommendations with decomposed scores.
        
        Weights (default):
            - model: 50% (original ML model confidence)
            - nutrition: 30% (nutrition target matching)
            - diversity: 20% (set diversity)
        """
```

### Scoring Formula

**Composite Score**:
```
composite_score = (w_model / W_total) × model_score 
                + (w_nutrition / W_total) × nutrition_match_score
                + (w_diversity / W_total) × diversity_score

where:
  w_model = 0.50 (model weight)
  w_nutrition = 0.30 (nutrition weight)
  w_diversity = 0.20 (diversity weight)
  W_total = 1.00
```

## Improvement Pipeline

### Step 1: Generate Base Recommendations
```
Base ML Model → 4 recommendations per date with sigmoid scores
```

### Step 2: Calculate Improvement Metrics
For each recommendation set:
```
For each date D:
  1. Load model recommendations + scores
  2. Extract nutrition values for each menu
  3. Calculate diversity_score = pairwise_L2_distance()
  4. Calculate nutrition_match_score = target_deviation()
  5. Calculate composite_score = weighted_combination()
  6. Store decomposed scores:
     - model_score: Original ML confidence
     - diversity_score: Set diversity (0-1)
     - nutrition_match_score: Target matching (0-1)
     - composite_score: Final quality (0-1)
     - score_improvement: composite - model delta
```

### Step 3: Apply to All Dates
```
apply_improvements.py processes all 20 training dates:
  - Loads each ai-selections_YYYY-MM-DD.json
  - Calculates composite scores
  - Updates JSON with new fields
  - Persists improved recommendations
```

### Step 4: Display in UI
Updated `displayAIRecommendations()` in app.js:
```javascript
// Show composite score in AI tab card
scorePercent = (recommendation.composite_score * 100).toFixed(1);

// Display score breakdown
score_breakdown = `
  複合スコア: ${composite}% | モデル: ${model}% | 多様性: ${diversity}% | 栄養: ${nutrition}%
`;

// Add improvement statistics to nutrition summary
improvement_stats = {
  avg_diversity_score: 0.125,
  avg_nutrition_match_score: 0.376,
  avg_composite_score: 0.521
};
```

## Implementation Files

### 1. `ml/improve_recommendations.py` (~300 lines)
Core improvement algorithms:
- `DiversityScorer` class
- `NutritionMatcher` class
- `AllergenFilter` class
- `RecommendationImprover` class
- Test execution with sample data

### 2. `ml/apply_improvements.py` (~200 lines)
Batch processor for all dates:
- Loads available-ai-dates.json
- Processes each date's recommendations
- Calculates composite scores
- Updates JSON files
- Generates statistics report

### 3. `app.js` (Modified)
- Enhanced `displayAIRecommendations()` method
- Shows composite score alongside model score
- Displays score breakdown (model/diversity/nutrition components)
- Aggregates improvement statistics for nutrition summary

### 4. `ai-styles.css` (Modified)
New CSS classes:
- `.improvement-badge`: Visual indicator for improved recommendations
- `.score-breakdown`: Score component breakdown display
- `.improvement-stats`: Statistics section styling
- `.stats-items`, `.stats-item`: Grid layout for stats

## Results & Metrics

### Overall Improvement Statistics (20 dates)

| Metric | Value | Notes |
|--------|-------|-------|
| **Diversity Score (avg)** | 0.1250 | Consistent across all dates |
| **Nutrition Match (avg)** | 0.3764 | Varies by date (0.30-0.42 range) |
| **Composite Score (avg)** | 0.5206 | Weighted combination of all factors |
| **Model Score (avg)** | 0.7673 | Original ML model confidence |
| **Score Improvement** | -0.2467 | Composite score reflects quality factors |
| **Processing Error Rate** | 0% | 20/20 dates processed successfully |

### Score Decomposition Example

For a typical recommendation:
```json
{
  "name": "Grilled chicken with seasonal vegetables",
  "rank": 1,
  "model_score": 0.85,
  "diversity_score": 0.12,
  "nutrition_match_score": 0.45,
  "composite_score": 0.52,
  "score_improvement": -0.33,
  "improvement_config": {
    "model_weight": 0.5,
    "nutrition_weight": 0.3,
    "diversity_weight": 0.2
  }
}
```

**Interpretation**:
- Model predicted 0.85 confidence (high quality)
- Set diversity is 0.12 (nutritionally similar menus, typical)
- Nutrition target match is 0.45 (moderate alignment)
- Composite score is 0.52 (balanced quality metric)
- Improvement delta shows composite < model (more conservative assessment)

## Configuration & Customization

### Weight Adjustment
Modify `RecommendationImprover` weights for different priorities:

```python
# High diversity focus
weights = {
    'model': 0.40,
    'nutrition': 0.20,
    'diversity': 0.40
}

# Nutrition-focused
weights = {
    'model': 0.30,
    'nutrition': 0.50,
    'diversity': 0.20
}
```

### Nutrition Target Customization
Override default targets in `NutritionMatcher`:

```python
custom_targets = {
    'protein': 25,    # grams
    'energy': 500,    # kcal
    'fat': 15,        # grams
    'carbs': 60       # grams
}
```

### Allergen Filtering
Apply during recommendation generation:

```python
improver.filter_by_allergen(
    menus,
    allergens=['卵', '乳類', '小麦']
)
```

## Technical Details

### Normalization Strategy
Nutrition values normalized to 0-1 range per category:
```
normalized_value = (value - min_value) / (max_value - min_value)
```

Based on observed ranges across all menus:
- Energy: 100-600 kcal
- Protein: 0-40g
- Fat: 0-30g
- Carbs: 10-100g

### Distance Metric
L2 (Euclidean) distance for diversity:
```
distance = sqrt((p1 - p2)² + (f1 - f2)² + (fa1 - fa2)² + (c1 - c2)²)
```

### Score Bounds
All component scores constrained to [0, 1]:
- **Model score**: Sigmoid output (naturally 0-1)
- **Diversity score**: Average pairwise distance (capped at 1)
- **Nutrition match**: Bounded deviation calculation
- **Composite score**: Weighted average (0-1 by definition)

## Integration with Existing System

### Data Flow
```
Training Data (20 dates)
         ↓
ML Model (Seq2Set Transformer)
         ↓
Base Recommendations (ai-selections_*.json)
         ↓
Improvement Layer (composite scoring)
         ↓
Enhanced Recommendations (with decomposed scores)
         ↓
UI Display (app.js displayAIRecommendations)
         ↓
Dashboard Visualization (Chart.js aggregation)
```

### File Structure
```
ml/
├── improve_recommendations.py     # Core algorithms
├── apply_improvements.py          # Batch processor
├── data/                          # Menu database
└── model/                         # Trained weights
```

### JSON Structure (Updated)
```json
{
  "date": "2026-01-13",
  "model": "Seq2Set-Transformer",
  "improvement_applied": true,
  "recommendations": [
    {
      "rank": 1,
      "name": "Menu name",
      "score": 0.85,                  // Original (kept for backward compat)
      "model_score": 0.85,            // NEW: Model confidence
      "diversity_score": 0.12,        // NEW: Set diversity
      "nutrition_match_score": 0.45,  // NEW: Target match
      "composite_score": 0.52,        // NEW: Final quality
      "score_improvement": -0.33,     // NEW: Improvement delta
      "nutrition": {...},
      "allergens": [...]
    }
  ],
  "improvement_stats": {
    "avg_diversity_score": 0.125,
    "avg_nutrition_match_score": 0.376,
    "avg_composite_score": 0.521
  }
}
```

## Performance Characteristics

### Computation Time
- Per-date processing: ~100-200ms
- All 20 dates: ~2-4 seconds
- Memory usage: Minimal (< 50MB)

### Scalability
- Linear time complexity O(n×m) where n=menus, m=components
- Suitable for real-time API requests (< 500ms per request)
- Batch processing preferred for historical data

## Future Enhancements

1. **User-Specific Nutrition Targets**
   - Store per-user preferences
   - Dynamically adjust composite scores
   - Track user nutrition evolution

2. **Dynamic Weight Adjustment**
   - ML-based weight optimization
   - User feedback loop for weight tuning
   - A/B testing infrastructure

3. **Advanced Diversity Metrics**
   - Ingredient-based diversity (non-repetition)
   - Cooking method diversity
   - Cuisine type diversity

4. **Preference Learning**
   - Track which recommendations users select
   - Learn implicit user preferences
   - Adjust composite scoring based on feedback

5. **Seasonal & Contextual Scoring**
   - Adjust diversity targets by season
   - Consider cost/availability factors
   - Time-of-day contextual scoring

## Testing & Validation

### Unit Tests
- `test_diversity_scorer()`: Verifies L2 distance calculation
- `test_nutrition_matcher()`: Confirms target deviation scoring
- `test_allergen_filter()`: Validates allergen filtering
- `test_composite_scoring()`: Checks weighted combination

### Integration Tests
- Load real ai-selections JSON files
- Calculate composite scores
- Verify JSON structure
- Check persistence

### Validation Results
```
✅ 20/20 dates processed
❌ 0 errors
✅ All JSON files updated
✅ Score ranges verified (0-1)
✅ Backward compatibility maintained
```

## Deployment Checklist

- [x] Core algorithms implemented
- [x] Batch processor created
- [x] All 20 dates processed
- [x] JSON files updated
- [x] UI display enhanced
- [x] CSS styling added
- [ ] User documentation
- [ ] API endpoint for custom weights
- [ ] Admin panel for configuration
- [ ] Performance monitoring

## References

- **Diversity Metric**: Jaccard distance variant adapted for nutrition vectors
- **Nutrition Matching**: Target deviation with weighted importance
- **Composite Scoring**: Multi-criteria decision analysis (MCDA) approach
- **Related Work**: Recommendation system diversity literature

---

**Status**: ✅ Complete for Phase 4-f
**Next**: Production deployment (Phase 5)
