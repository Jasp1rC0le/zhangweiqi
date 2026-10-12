package com.campusai.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import com.campusai.dto.ModelUsageSummaryResponse;

import java.util.List;

@Mapper
public interface AiModelUsageMapper {

    int insert(
            @Param("messageId") Long messageId,
            @Param("userId") Long userId,
            @Param("provider") String provider,
            @Param("model") String model,
            @Param("promptTokens") Integer promptTokens,
            @Param("completionTokens") Integer completionTokens,
            @Param("totalTokens") Integer totalTokens
    );

    List<ModelUsageSummaryResponse> findRecentSummaryBySchoolId(
            @Param("schoolId") Long schoolId
    );
}
