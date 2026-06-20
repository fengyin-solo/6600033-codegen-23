from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import numpy as np
from scipy import stats
import io
import csv
import json

app = FastAPI(title="Monte Carlo API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class SampleData(BaseModel):
    name: str
    values: List[float]


class BatchImportRequest(BaseModel):
    samples: List[SampleData]
    rawText: Optional[str] = None


class TestRequest(BaseModel):
    testType: str
    samples: List[SampleData]
    params: Optional[Dict[str, Any]] = None


class RecommendRequest(BaseModel):
    samples: List[SampleData]


def analyze_sample(values: List[float]) -> Dict[str, Any]:
    arr = np.array(values, dtype=float)
    n = len(arr)
    mean = float(np.mean(arr))
    std = float(np.std(arr, ddof=1)) if n > 1 else 0.0
    min_v = float(np.min(arr))
    max_v = float(np.max(arr))
    median = float(np.median(arr))
    skewness = float(stats.skew(arr)) if n > 2 else 0.0
    kurtosis = float(stats.kurtosis(arr)) if n > 3 else 0.0

    unique_ratio = len(np.unique(arr)) / n if n > 0 else 0
    is_discrete = unique_ratio < 0.3 or all(float(v).is_integer() for v in arr[:min(n, 50)])

    is_normal = True
    if n >= 8:
        try:
            _, p_norm = stats.normaltest(arr)
            is_normal = p_norm > 0.05
        except Exception:
            is_normal = False

    return {
        "count": n,
        "mean": mean,
        "std": std,
        "min": min_v,
        "max": max_v,
        "median": median,
        "skewness": skewness,
        "kurtosis": kurtosis,
        "isDiscrete": is_discrete,
        "isNormal": is_normal,
        "uniqueRatio": unique_ratio,
    }


@app.get("/")
def root():
    return {"service": "Monte Carlo API", "status": "running"}


@app.post("/api/import/text")
def import_text(req: BatchImportRequest):
    result = []
    for s in req.samples:
        stats_info = analyze_sample(s.values)
        result.append({"name": s.name, "values": s.values, "stats": stats_info})
    return {"samples": result}


@app.post("/api/import/file")
async def import_file(file: UploadFile = File(...)):
    content = await file.read()
    filename = file.filename.lower()
    samples = []

    try:
        if filename.endswith(".csv"):
            text = content.decode("utf-8-sig")
            reader = csv.reader(io.StringIO(text))
            rows = list(reader)
            if not rows:
                raise HTTPException(status_code=400, detail="CSV 文件为空")

            headers = rows[0]
            col_count = len(headers)

            for col_idx in range(col_count):
                col_values = []
                col_name = headers[col_idx] if col_idx < len(headers) else f"样本{col_idx + 1}"
                for row in rows[1:]:
                    if col_idx < len(row) and row[col_idx].strip():
                        try:
                            col_values.append(float(row[col_idx].strip()))
                        except ValueError:
                            continue
                if col_values:
                    samples.append(SampleData(name=col_name, values=col_values))

        elif filename.endswith(".json"):
            data = json.loads(content.decode("utf-8"))
            if isinstance(data, list):
                if all(isinstance(x, (int, float)) for x in data):
                    samples.append(SampleData(name="样本1", values=[float(x) for x in data]))
                elif all(isinstance(x, dict) for x in data):
                    keys = set()
                    for item in data:
                        keys.update(item.keys())
                    for key in keys:
                        col_values = []
                        for item in data:
                            if key in item and isinstance(item[key], (int, float)):
                                col_values.append(float(item[key]))
                        if col_values:
                            samples.append(SampleData(name=str(key), values=col_values))
            elif isinstance(data, dict):
                for key, val in data.items():
                    if isinstance(val, list) and all(isinstance(x, (int, float)) for x in val):
                        samples.append(SampleData(name=str(key), values=[float(x) for x in val]))

        else:
            text = content.decode("utf-8")
            lines = [line.strip() for line in text.splitlines() if line.strip()]
            for i, line in enumerate(lines):
                parts = [p.strip() for p in line.replace("\t", ",").split(",") if p.strip()]
                values = []
                for p in parts:
                    try:
                        values.append(float(p))
                    except ValueError:
                        continue
                if values:
                    samples.append(SampleData(name=f"样本{i + 1}", values=values))

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"文件解析失败: {str(e)}")

    if not samples:
        raise HTTPException(status_code=400, detail="未解析到有效数值数据")

    result = []
    for s in samples:
        stats_info = analyze_sample(s.values)
        result.append({"name": s.name, "values": s.values, "stats": stats_info})

    return {"samples": result, "fileName": file.filename}


@app.post("/api/recommend")
def recommend_flows(req: RecommendRequest):
    samples = req.samples
    n_samples = len(samples)

    analyzed = []
    for s in samples:
        analyzed.append({
            "name": s.name,
            "values": s.values,
            "stats": analyze_sample(s.values),
        })

    simulations = []
    tests = []

    if n_samples == 1:
        s = analyzed[0]
        st = s["stats"]

        if st["count"] >= 30 and st["isNormal"]:
            simulations.append({
                "id": "brownian",
                "name": "布朗运动模拟",
                "reason": f"样本量 {st['count']}，近似正态分布 (mean={st['mean']:.3f}, std={st['std']:.3f})",
                "matchScore": 0.85,
            })
        if st["isDiscrete"] and st["uniqueRatio"] < 0.15:
            simulations.append({
                "id": "random_walk",
                "name": "随机游走",
                "reason": f"数据呈离散特征，唯一值占比 {st['uniqueRatio']:.2f}",
                "matchScore": 0.75,
            })
        if st["std"] > 0 and st["count"] >= 20:
            simulations.append({
                "id": "diffusion",
                "name": "粒子扩散",
                "reason": f"样本有变异，可用于扩散位移分析 (std={st['std']:.3f})",
                "matchScore": 0.6,
            })

        tests.append({
            "id": "normality",
            "name": "正态性检验",
            "reason": "单样本推荐先验证分布假设",
            "matchScore": 0.9,
        })
        tests.append({
            "id": "one_sample_t",
            "name": "单样本 T 检验",
            "reason": f"可检验样本均值是否等于理论值 (mean={st['mean']:.3f})",
            "matchScore": 0.8,
        })

    elif n_samples == 2:
        s1, s2 = analyzed[0], analyzed[1]
        st1, st2 = s1["stats"], s2["stats"]

        tests.append({
            "id": "two_sample_t",
            "name": "独立样本 T 检验",
            "reason": f"两组样本 (n1={st1['count']}, n2={st2['count']})，推荐比较均值差异",
            "matchScore": 0.95,
        })

        if st1["isNormal"] and st2["isNormal"]:
            tests.append({
                "id": "f_test",
                "name": "方差齐性 F 检验",
                "reason": "两组均近似正态分布，可检验方差齐性",
                "matchScore": 0.7,
            })

        if st1["isDiscrete"] and st2["isDiscrete"]:
            tests.append({
                "id": "chi_square",
                "name": "卡方检验",
                "reason": "两组离散数据，可检验分布独立性",
                "matchScore": 0.75,
            })

        simulations.append({
            "id": "option",
            "name": "欧式期权定价",
            "reason": "可比较两组作为不同参数下的定价基准",
            "matchScore": 0.4,
        })

    else:
        all_normal = all(a["stats"]["isNormal"] for a in analyzed)
        all_discrete = all(a["stats"]["isDiscrete"] for a in analyzed)

        tests.append({
            "id": "anova",
            "name": "单因素方差分析 (ANOVA)",
            "reason": f"{n_samples} 组样本，推荐检验多组均值差异",
            "matchScore": 0.95,
        })

        if all_normal:
            tests.append({
                "id": "bartlett",
                "name": "Bartlett 方差齐性检验",
                "reason": "多组近似正态分布，可检验方差齐性",
                "matchScore": 0.7,
            })

        if all_discrete:
            tests.append({
                "id": "chi_square",
                "name": "卡方检验",
                "reason": "多组离散数据，可检验分布独立性",
                "matchScore": 0.65,
            })

        simulations.append({
            "id": "gambler",
            "name": "赌徒破产",
            "reason": "多组样本可模拟不同破产概率场景",
            "matchScore": 0.4,
        })

    simulations.append({
        "id": "pi",
        "name": "圆周率π估算",
        "reason": "基础蒙特卡洛场景，可用于对比方法准确性",
        "matchScore": 0.3,
    })

    simulations.sort(key=lambda x: -x["matchScore"])
    tests.sort(key=lambda x: -x["matchScore"])

    return {
        "samples": analyzed,
        "recommendedSimulations": simulations,
        "recommendedTests": tests,
    }


@app.post("/api/test")
def run_test(req: TestRequest):
    tt = req.testType
    samples = [np.array(s.values, dtype=float) for s in req.samples]

    try:
        if tt == "normality":
            if len(samples) < 1:
                raise HTTPException(status_code=400, detail="至少需要1组样本")
            stat, p = stats.normaltest(samples[0])
            return {
                "testType": "正态性检验 (D'Agostino-Pearson)",
                "statistic": float(stat),
                "pValue": float(p),
                "significant": p < 0.05,
                "alpha": 0.05,
                "interpretation": "显著(p<0.05)则拒绝正态假设" if p < 0.05 else "不显著，不能拒绝正态假设",
            }

        if tt == "one_sample_t":
            if len(samples) < 1:
                raise HTTPException(status_code=400, detail="至少需要1组样本")
            popmean = (req.params or {}).get("popmean", 0.0)
            t, p = stats.ttest_1samp(samples[0], popmean)
            return {
                "testType": "单样本 T 检验",
                "statistic": float(t),
                "pValue": float(p),
                "df": len(samples[0]) - 1,
                "significant": p < 0.05,
                "alpha": 0.05,
                "popmean": popmean,
                "interpretation": "显著(p<0.05)则样本均值与理论值有显著差异" if p < 0.05 else "无显著差异",
            }

        if tt == "two_sample_t":
            if len(samples) < 2:
                raise HTTPException(status_code=400, detail="需要2组样本")
            equal_var = (req.params or {}).get("equalVar", False)
            t, p = stats.ttest_ind(samples[0], samples[1], equal_var=equal_var)
            n1, n2 = len(samples[0]), len(samples[1])
            v1 = float(np.var(samples[0], ddof=1))
            v2 = float(np.var(samples[1], ddof=1))
            if equal_var:
                df = n1 + n2 - 2
            else:
                df = round((v1 / n1 + v2 / n2) ** 2 / ((v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1)))
            return {
                "testType": "独立样本 T 检验" + (" (假设方差相等)" if equal_var else " (Welch, 不等方差)"),
                "statistic": float(t),
                "pValue": float(p),
                "df": df,
                "significant": p < 0.05,
                "alpha": 0.05,
                "mean1": float(np.mean(samples[0])),
                "mean2": float(np.mean(samples[1])),
                "interpretation": "显著(p<0.05)则两组均值有显著差异" if p < 0.05 else "两组均值无显著差异",
            }

        if tt == "f_test":
            if len(samples) < 2:
                raise HTTPException(status_code=400, detail="需要2组样本")
            v1 = float(np.var(samples[0], ddof=1))
            v2 = float(np.var(samples[1], ddof=1))
            f = v1 / v2 if v2 > 0 else float("inf")
            df1 = len(samples[0]) - 1
            df2 = len(samples[1]) - 1
            p = 2 * min(stats.f.cdf(f, df1, df2), 1 - stats.f.cdf(f, df1, df2))
            return {
                "testType": "方差齐性 F 检验",
                "statistic": float(f),
                "pValue": float(p),
                "df1": df1,
                "df2": df2,
                "var1": v1,
                "var2": v2,
                "significant": p < 0.05,
                "alpha": 0.05,
                "interpretation": "显著(p<0.05)则两组方差有显著差异" if p < 0.05 else "两组方差无显著差异（方差齐）",
            }

        if tt == "anova":
            if len(samples) < 2:
                raise HTTPException(status_code=400, detail="至少需要2组样本")
            f, p = stats.f_oneway(*samples)
            df_between = len(samples) - 1
            df_within = sum(len(s) for s in samples) - len(samples)
            return {
                "testType": "单因素方差分析 (ANOVA)",
                "statistic": float(f),
                "pValue": float(p),
                "dfBetween": df_between,
                "dfWithin": df_within,
                "significant": p < 0.05,
                "alpha": 0.05,
                "groupMeans": [float(np.mean(s)) for s in samples],
                "interpretation": "显著(p<0.05)则至少有一组均值与其他组有显著差异" if p < 0.05 else "各组均值无显著差异",
            }

        if tt == "bartlett":
            if len(samples) < 2:
                raise HTTPException(status_code=400, detail="至少需要2组样本")
            stat, p = stats.bartlett(*samples)
            return {
                "testType": "Bartlett 方差齐性检验",
                "statistic": float(stat),
                "pValue": float(p),
                "significant": p < 0.05,
                "alpha": 0.05,
                "interpretation": "显著(p<0.05)则各组方差有显著差异" if p < 0.05 else "各组方差无显著差异（方差齐）",
            }

        if tt == "chi_square":
            if len(samples) < 1:
                raise HTTPException(status_code=400, detail="需要样本数据")
            observed = np.array([len(s) for s in samples], dtype=float)
            expected = np.full_like(observed, observed.mean())
            chi2, p = stats.chisquare(observed, expected)
            return {
                "testType": "卡方拟合优度检验",
                "statistic": float(chi2),
                "pValue": float(p),
                "df": len(observed) - 1,
                "observed": observed.tolist(),
                "expected": expected.tolist(),
                "significant": p < 0.05,
                "alpha": 0.05,
                "interpretation": "显著(p<0.05)则观测分布与期望分布有显著差异" if p < 0.05 else "观测分布与期望无显著差异",
            }

        if tt == "mann_whitney":
            if len(samples) < 2:
                raise HTTPException(status_code=400, detail="需要2组样本")
            u, p = stats.mannwhitneyu(samples[0], samples[1], alternative="two-sided")
            return {
                "testType": "Mann-Whitney U 检验 (非参数)",
                "statistic": float(u),
                "pValue": float(p),
                "significant": p < 0.05,
                "alpha": 0.05,
                "interpretation": "显著(p<0.05)则两组分布有显著差异" if p < 0.05 else "两组分布无显著差异",
            }

        raise HTTPException(status_code=400, detail=f"未知检验类型: {tt}")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"检验执行失败: {str(e)}")
