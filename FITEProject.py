import numpy as np
import pandas as pd
import yfinance as yf
import matplotlib.pyplot as plt
from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics import mean_squared_error, mean_absolute_error
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout
from tensorflow.keras.callbacks import EarlyStopping

plt.style.use("seaborn-v0_8")

df = yf.download("SPY", start="2014-01-01", end="2025-06-01", auto_adjust=False)
df = df[["Adj Close", "Close", "Open", "High", "Low", "Volume"]]
df.rename(columns={"Adj Close": "AdjClose"}, inplace=True)
df.dropna(inplace=True)

def add_indicators(data):
    d = data.copy()

    d["MA10"] = d["AdjClose"].rolling(10).mean()
    d["MA30"] = d["AdjClose"].rolling(30).mean()
    d["MA90"] = d["AdjClose"].rolling(90).mean()

    d["logReturn"] = np.log(d["AdjClose"] / d["AdjClose"].shift(1))

    d["Volatility20"] = d["logReturn"].rolling(20).std()

    difference = d["AdjClose"].diff()
    gain = difference.where(difference > 0, 0)
    loss = -difference.where(difference < 0, 0)
    roll_up = gain.rolling(14).mean()
    roll_down = loss.rolling(14).mean()
    relativeStrength = roll_up / (roll_down + 1e-10)
    d["RSI14"] = 100 - (100 / (1 + relativeStrength))

    d.dropna(inplace=True)
    return d

df = add_indicators(df)
df["AdjClose_next"] = df["AdjClose"].shift(-1)
df.dropna(inplace=True)

##
train_df = df.loc["2015-01-01":"2021-12-31"]
test_df  = df.loc["2022-01-01":"2025-06-01"]

##
features = [
    "AdjClose", "MA10", "MA30", "MA90",
    "logReturn", "Volatility20", "RSI14",
    "Volume"
    ]

target = "AdjClose_next"

X_train_raw = train_df[features].values
y_train_raw = train_df[target].values.reshape(-1, 1)
X_test_raw = test_df[features].values
y_test_raw = test_df[target].values.reshape(-1, 1)


feature_scaler = MinMaxScaler()
target_scaler = MinMaxScaler()

X_train_scaled = feature_scaler.fit_transform(X_train_raw)
X_test_scaled  = feature_scaler.transform(X_test_raw)
y_train_scaled = target_scaler.fit_transform(y_train_raw)
y_test_scaled  = target_scaler.transform(y_test_raw)

##

def create_sequences(X, y, seq_len):
    Xs, ys = [], []
    for i in range(seq_len, len(X)):
        Xs.append(X[i-seq_len:i])
        ys.append(y[i])
    return np.array(Xs), np.array(ys)


def build_lstm(input_shape):
    model = Sequential()
    model.add(LSTM(128, return_sequences=True, input_shape=input_shape))
    model.add(Dropout(0.2))
    model.add(LSTM(128, return_sequences=False))
    model.add(Dropout(0.2))
    model.add(Dense(64, activation="relu"))
    model.add(Dense(1))
    model.compile(optimizer="adam", loss="mean_squared_error")
    model.summary()
    return model


def buildModel(seq_len, label):

    X_train_seq, y_train_seq = create_sequences(X_train_scaled, y_train_scaled, seq_len)
    X_test_seq,  y_test_seq  = create_sequences(X_test_scaled,  y_test_scaled,  seq_len)

    callback = EarlyStopping(monitor='val_loss', patience=15, restore_best_weights=True)

    model = build_lstm((seq_len, X_train_seq.shape[2]))
    model.fit(
        X_train_seq, 
        y_train_seq,
        epochs=50, 
        batch_size=32,
        validation_split=0.1,
        callbacks=[callback],
        verbose=1
        )

    y_pred_scaled = model.predict(X_test_seq)
    y_pred = target_scaler.inverse_transform(y_pred_scaled)
    y_true = target_scaler.inverse_transform(y_test_seq)

    mse = mean_squared_error(y_true, y_pred)
    rmse = np.sqrt(mse)
    mae = mean_absolute_error(y_true, y_pred)

    print(f"{label} results -> MSE: {mse:.2f}, RMSE: {rmse:.2f}, MAE: {mae:.2f}")

    test_dates = test_df.index[seq_len:]

    return model, mse, rmse, mae, (test_dates, y_true, y_pred)

##output
model_90, mse_90, rmse_90, mae_90, results_90 = buildModel(90, "90-day lookback")
model_30, mse_30, rmse_30, mae_30, results_30 = buildModel(30, "30-day lookback")
model_10, mse_10, rmse_10, mae_10, results_10 = buildModel(10, "10-day lookback")

print("\nEval Results:")
print(f"90-day -> MSE: {mse_90:.2f}, RMSE: {rmse_90:.2f}, MAE: {mae_90:.2f}")
print(f"30-day -> MSE: {mse_30:.2f}, RMSE: {rmse_30:.2f}, MAE: {mae_30:.2f}")
print(f"10-day -> MSE: {mse_10:.2f}, RMSE: {rmse_10:.2f}, MAE: {mae_10:.2f}")


##baseline moving average (not ML)
test_df["Baseline_MA10"] = test_df["AdjClose"].rolling(10).mean()
test_df.dropna(inplace=True)

test_dates_10, y_true_10, y_pred_10 = results_10
moving_average_10 = test_df.loc[test_dates_10, "Baseline_MA10"].values.reshape(-1, 1)

baseline_mse = mean_squared_error(y_true_10, moving_average_10)
baseline_rmse = np.sqrt(baseline_mse)
baseline_mae = mean_absolute_error(y_true_10, moving_average_10)

print("\nBaseline MA10 -> "
      f"MSE: {baseline_mse:.2f}, RMSE: {baseline_rmse:.2f}, MAE: {baseline_mae:.2f}")


##next-day prices
last_seq_90 = X_test_scaled[-90:].reshape(1, 90, X_test_scaled.shape[1])
next_day_price_90 = target_scaler.inverse_transform(model_90.predict(last_seq_90))[0][0]

last_seq_30 = X_test_scaled[-30:].reshape(1, 30, X_test_scaled.shape[1])
next_day_price_30 = target_scaler.inverse_transform(model_30.predict(last_seq_30))[0][0]

last_seq_10 = X_test_scaled[-10:].reshape(1, 10, X_test_scaled.shape[1])
next_day_price_10 = target_scaler.inverse_transform(model_10.predict(last_seq_10))[0][0]

print(f"\nNext-Day Predictions:")
print(f"90-day LSTM -> {next_day_price_90:.2f}")
print(f"30-day LSTM -> {next_day_price_30:.2f}")
print(f"10-day LSTM -> {next_day_price_10:.2f}")
print(f"Baseline MA10 -> {test_df['Baseline_MA10'].iloc[-1]:.2f}")


##plots
dates_90, y_true_90, y_pred_90 = results_90
dates_30, y_true_30, y_pred_30 = results_30
dates_10, y_true_10, y_pred_10 = results_10

min_len = min(len(dates_90), len(dates_30), len(dates_10))

dates_common = dates_90[-min_len:]
actual_common = y_true_90[-min_len:]
pred_90_common = y_pred_90[-min_len:]
pred_30_common = y_pred_30[-min_len:]
pred_10_common = y_pred_10[-min_len:]

ma10_common = test_df.loc[dates_common, "Baseline_MA10"].values.reshape(-1, 1)

plt.figure(figsize=(16, 7))
plt.plot(dates_common, actual_common, label="Actual", linewidth=2, color="black")
plt.plot(dates_common, pred_90_common, label="LSTM 90-day")
plt.plot(dates_common, pred_30_common, label="LSTM 30-day")
plt.plot(dates_common, pred_10_common, label="LSTM 10-day")
plt.plot(dates_common, ma10_common, label="MA10 Baseline", linestyle="--", color="orange")

plt.title("SPY — Actual vs LSTM Predictions (90, 30, 10-day) + MA10 Baseline")
plt.xlabel("Date")
plt.ylabel("Price")
plt.legend()
plt.xticks(rotation=45)
plt.tight_layout()
plt.show()

