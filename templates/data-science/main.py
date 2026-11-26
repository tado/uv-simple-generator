import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns


def main() -> None:
    """Main entry point."""
    rng = np.random.default_rng(seed=0)
    x = rng.normal(size=100)
    df = pd.DataFrame({"x": x, "y": 2 * x + rng.normal(size=100)})

    sns.scatterplot(data=df, x="x", y="y")
    plt.title("Scatter Plot")
    plt.show()

if __name__ == "__main__":
    main()
