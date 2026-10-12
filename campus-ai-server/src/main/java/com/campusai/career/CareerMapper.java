package com.campusai.career;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;
import java.util.List;

@Mapper
public interface CareerMapper {
    @Insert("""
            insert into campus_employers (school_id, name, industry, website_url, description, status)
            values (#{schoolId}, #{name}, #{industry}, #{websiteUrl}, #{description}, 'DRAFT')
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insertEmployer(CampusEmployer value);

    @Select("select * from campus_employers where id = #{id} and school_id = #{schoolId}")
    CampusEmployer employer(@Param("schoolId") Long schoolId, @Param("id") Long id);

    @Select("select * from campus_employers where school_id = #{schoolId} order by updated_at desc, id desc limit 200")
    List<CampusEmployer> employers(@Param("schoolId") Long schoolId);

    @Update("""
            update campus_employers set name = #{name}, industry = #{industry},
                website_url = #{websiteUrl}, description = #{description}
            where id = #{id} and school_id = #{schoolId}
            """)
    int updateEmployer(CampusEmployer value);

    @Update("update campus_employers set status = #{status} where id = #{id} and school_id = #{schoolId}")
    int employerStatus(@Param("schoolId") Long schoolId, @Param("id") Long id,
                       @Param("status") String status);

    @Insert("""
            insert into campus_jobs (school_id, employer_id, title, employment_type, location,
                                     source_url, description, posted_at, expires_at, status)
            values (#{schoolId}, #{employerId}, #{title}, #{employmentType}, #{location},
                    #{sourceUrl}, #{description}, #{postedAt}, #{expiresAt}, 'DRAFT')
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insertJob(CampusJob value);

    @Select("select * from campus_jobs where id = #{id} and school_id = #{schoolId}")
    CampusJob job(@Param("schoolId") Long schoolId, @Param("id") Long id);

    @Select("select * from campus_jobs where school_id = #{schoolId} order by updated_at desc, id desc limit 300")
    List<CampusJob> jobs(@Param("schoolId") Long schoolId);

    @Update("""
            update campus_jobs set employer_id = #{employerId}, title = #{title},
                employment_type = #{employmentType}, location = #{location}, source_url = #{sourceUrl},
                description = #{description}, posted_at = #{postedAt}, expires_at = #{expiresAt}
            where id = #{id} and school_id = #{schoolId}
            """)
    int updateJob(CampusJob value);

    @Update("update campus_jobs set status = #{status} where id = #{id} and school_id = #{schoolId}")
    int jobStatus(@Param("schoolId") Long schoolId, @Param("id") Long id,
                  @Param("status") String status);

    @Select("""
            select job.* from campus_jobs job
            inner join campus_employers employer on employer.id = job.employer_id
            where job.school_id = #{schoolId} and employer.school_id = #{schoolId}
              and job.status = 'PUBLISHED' and employer.status = 'PUBLISHED'
              and (job.expires_at is null or job.expires_at > current_timestamp)
            order by job.posted_at desc, job.id desc limit 100
            """)
    List<CampusJob> publishedJobs(@Param("schoolId") Long schoolId);
}
